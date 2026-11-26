import { pool } from "../db.ts";
import type { ChunkRow } from "./types.ts";

// 'simple' config (used on both the stored tsv and here) keeps every word as a literal lexeme,
// including filler words - unlike 'english', which would recognize these as stopwords and drop
// them on its own. We stay on 'simple' deliberately (see toOrQuery below) and filter this short
// list ourselves instead, rather than switching configs - 'english' also stems words (e.g.
// "indicates" -> "indic"), and since the stored tsv never gets that stemming, a config mismatch
// would silently break matches on perfectly good content words.
const STOPWORDS = new Set([
  "a", "an", "the", "this", "that", "these", "those",
  "is", "are", "was", "were", "be", "been", "being", "am",
  "do", "does", "did", "doing",
  "has", "have", "had", "having",
  "can", "could", "will", "would", "shall", "should", "may", "might", "must",
  "what", "which", "who", "whom", "whose", "when", "where", "why", "how",
  "to", "of", "in", "on", "at", "for", "with", "about", "as", "by", "from", "into", "than",
  "and", "or", "but", "not", "so", "if", "then", "there", "here",
  "i", "you", "he", "she", "it", "we", "they", "me", "him", "her", "us", "them",
  "my", "your", "his", "its", "our", "their",
  "mean", "means", "meaning",
]);

// plainto_tsquery ANDs every word together, so a natural-language question - which carries
// filler words 'simple' config doesn't strip - almost never matches anything (needs every
// single word present in one chunk). OR-ing the words instead means a chunk matching just one
// of them still comes back, naturally ranked lower by ts_rank than one matching several -
// dropping stopwords first keeps those filler words from diluting that ranking, since otherwise
// a chunk that happens to contain several of them (by pure chance) can outrank one that actually
// contains the specific term being asked about.
//
// to_tsquery (unlike plainto_tsquery) treats "&", "|", "!", "(", ")" as real query-language
// operators, so building its argument from raw user input isn't safe to do directly - this
// strips the question down to plain word tokens first, so the only operator that ever reaches
// to_tsquery is the "|" this function itself inserts.
function toOrQuery(query: string): string | null {
  const words = query.match(/[a-zA-Z0-9]+/g) ?? [];
  const meaningful = words.filter((word) => !STOPWORDS.has(word.toLowerCase()));
  // If the question was nothing but stopwords (e.g. "what is this"), fall back to searching on
  // the original words rather than returning no query at all.
  const toJoin = meaningful.length > 0 ? meaningful : words;
  if (toJoin.length === 0) return null;
  return toJoin.join(" | ");
}

export async function fullTextSearch(query: string, limit: number): Promise<ChunkRow[]> {
  const orQuery = toOrQuery(query);
  if (!orQuery) return [];

  const { rows } = await pool.query(
    `SELECT id, source_type, source_id, title, metadata, text
      FROM chunks
      WHERE tsv @@ to_tsquery('simple', $1)
      ORDER BY ts_rank(tsv, to_tsquery('simple', $1)) DESC
      LIMIT $2`,[orQuery, limit])
  return rows.map(row => ({
    id: row.id,
    sourceType: row.source_type,
    sourceId: row.source_id,
    title: row.title,
    text: row.text,
    metadata: row.metadata,
  }));
}
