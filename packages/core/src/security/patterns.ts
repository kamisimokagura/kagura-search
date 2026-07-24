export interface PIPattern {
  pattern: RegExp;
  description: string;
  severity: "block" | "warn";
}

export const PI_PATTERNS: PIPattern[] = [
  {
    pattern:
      /ignore\s+(all\s+)?(previous|prior|above)\s+(instructions|rules|guidelines)/i,
    description: "Instruction override attempt",
    severity: "block",
  },
  {
    pattern:
      /(?:show|reveal|display|print|output)\s+(?:me\s+)?(?:your\s+)?system\s+prompt/i,
    description: "System prompt extraction",
    severity: "block",
  },
  {
    pattern: /you\s+are\s+now\s+(?:a|an)\s+/i,
    description: "Role override attempt",
    severity: "block",
  },
  {
    pattern:
      /(?:forget|disregard|override)\s+(?:all\s+)?(?:your\s+)?(?:rules|instructions|constraints)/i,
    description: "Constraint bypass attempt",
    severity: "block",
  },
  {
    pattern: /\bdo\s+not\s+follow\s+(?:any|your)\s+(?:rules|guidelines)\b/i,
    description: "Rule negation attempt",
    severity: "block",
  },
  {
    pattern: /\b(?:SELECT|INSERT|UPDATE|DELETE|DROP|UNION)\s+/i,
    description: "SQL-like pattern detected",
    severity: "warn",
  },
  {
    pattern: /<script[\s>]/i,
    description: "Script tag detected",
    severity: "warn",
  },
];

export const MALICIOUS_PATTERNS: PIPattern[] = [
  {
    pattern:
      /(?:find|track|locate|stalk)\s+(?:someone|person|individual)(?:'s)?\s+(?:home\s+)?(?:address|location|whereabouts)\s+(?:without|secretly)/i,
    description: "Stalking/tracking attempt",
    severity: "block",
  },
  {
    pattern:
      /(?:how\s+to\s+)?(?:hack|break\s+into|compromise)\s+(?:someone|a\s+person)(?:'s)?\s+(?:account|email|phone)/i,
    description: "Unauthorized access attempt",
    severity: "block",
  },
];

// Credential / secret patterns redacted from surfaced search-result content.
// These are high-severity "block" patterns; OutputShield strips their matches
// (replaced with nothing, never a planted sentinel). Generic assignment
// patterns use a lookbehind that excludes alnum (not [\w-]) so namespaced keys
// like DB_PASSWORD / MY_API_KEY still match, while embedded words like
// "mypassword" do not.
// Generic credential-assignment helpers (compiled into regexes below).
// SEP makes compound keys match snake_case, kebab-case, AND camelCase
// (e.g. clientSecret) under the case-insensitive flag.
const SEP = String.raw`[_-]?`;
const KEY_COMPOUNDS = [
  `client${SEP}secret`, `private${SEP}key`, `access${SEP}token`, `refresh${SEP}token`,
  `secret${SEP}key`, `signing${SEP}key`, `encryption${SEP}key`, `api${SEP}key`, "apikey",
  `aws${SEP}secret${SEP}access${SEP}key`, `secret${SEP}access${SEP}key`,
  `account${SEP}key`, `connection${SEP}string`,
].join("|");
// STRONG credential key names. `=` assignments (config-style) redact ANY value;
// inline `:` (possibly prose) redacts only secret-shaped values.
const STRONG_KEYS = [
  "password", "passwd", "pwd", "auth", "secret", "token", "credential",
  KEY_COMPOUNDS,
].join("|");
// Strong keys that justify redacting an inline `:` value (unambiguous secrets).
// `auth` is INTENTIONALLY excluded: inline `auth: <value>` is usually a method
// descriptor (e.g. "auth: OAuth2Authentication"), not a secret. It is still
// redacted under config syntax (`=` / line-start / namespaced forms).
const STRONG_KEYS_INLINE = [
  "password", "passwd", "pwd", "secret", "token", "credential",
  KEY_COMPOUNDS,
].join("|");
// camelCase credential suffixes (capitalized) for compound keys STRONG_KEYS cannot
// anchor (e.g. dbPassword, githubToken, serviceApiKey). Lowercase suffixes such as
// "mypassword" are excluded because the suffix must be capitalized.
const CAMEL_SUFFIX = ["Password", "Secret", "Token", "ApiKey", "AccessToken", "PrivateKey", "ClientSecret"].join("|");
// Narrow ambiguous keys (noisy `key`/`code`/`pin`/`otp` dropped) — only matched
// with a secret-shaped value to avoid stripping ordinary prose.
const AMBIGUOUS_KEYS = [
  "token_id", "session", "session_id",
].join("|");
const QUOTED = String.raw`"(?:[^"\\\r\n]|\\.)*"|'(?:[^'\\\r\n]|\\.)*'`;
const SECRET_SHAPED = String.raw`[A-Za-z0-9_\-\.]{12,}`;
// A bare inline value is "secret-shaped" only with stronger evidence, to spare
// ordinary prose such as `environment-variable` or `required.`:
//   - quoted, OR
//   - contains a digit OR a "strong" special char (excluding hyphen/period/underscore,
//     which appear in normal prose) AND is >= 10 non-space chars.
// The consuming class includes the special chars so a value like `p@ssw0rd!23` is
// fully consumed (not stopped at the first special char). Line-anchored/config
// assignments keep broad matching (any value); this class is only for inline
// `:`/ambiguous assignments that may be descriptive prose.
const STRONG_SPECIAL = String.raw`[!@#$%^&*+=?~/]`;
const INLINE_SECRET = String.raw`${QUOTED}|(?=[^\s"']*(?:[0-9]|${STRONG_SPECIAL}))[^\s"']{10,}`;
// Same as INLINE_SECRET but without the 10-char floor, used for inline `:` values
// of strong credential keys (key-gated) so short secrets like `hunter2`/`abc123`
// are caught. Key-gating keeps `version: 2` (non-secret key) from matching.
const INLINE_SECRET_SHORT = String.raw`${QUOTED}|(?=[^\s"']*(?:[0-9]|${STRONG_SPECIAL}))[^\s"']+`;
// Unicode-aware left boundary (letters, numbers, combining marks).
const LBOUND = String.raw`(?<![\p{L}\p{N}\p{M}])`;
// Namespaced-key left boundary: also excludes namespace separators so the match
// starts only at a complete identifier (prevents superlinear prefix scanning).
const NS_BOUND = String.raw`(?<![\p{L}\p{N}\p{M}._-])`;
// Line-anchored / assigned value: a full quoted string (spaces allowed) or a bare
// whitespace-delimited token. QUOTED is tried first so multi-word quoted secrets
// are removed in full, not just up to the first space.
const LINE_VALUE = String.raw`(?:${QUOTED}|\S+)`;
// Rest-of-line value for config/anchored assignments (line-start, namespaced,
// YAML-list). Consumes through end of line so unquoted multi-word secrets
// (`password: correct horse battery staple`) are fully removed, not just the
// first token. Inline prose patterns stay token-scoped (see INLINE_SECRET).
const LINE_REST = String.raw`[^\n]*`;
// Structured value: consume up to a structural delimiter (newline, `;`, `,`,
// `}`, `]`) or EOL, for clearly-structured assignments (namespaced, line-start
// credential `=`/`:`, YAML-list, camelCase). Stops at `,` so comma-separated
// sibling assignments on the same line are separated and redacted individually.
const STRUCT_VALUE = String.raw`[^\n;,}\]]*`;
// Namespaced-key prefix (required), e.g. "DB_" or "MY_API_" before a strong key.
const NS_PREFIX = String.raw`(?:[A-Za-z0-9]+[_.-])+`;

export const SECRET_PATTERNS: PIPattern[] = [
  // NOTE: PEM / PGP / encrypted private-key blocks are redacted by a linear scanner
  // in OutputShield (stripPrivateKeyBlocks), not a regex, to avoid quadratic behavior
  // and to handle blocks truncated at the content boundary (fail-closed to EOF).
  // AWS access key IDs (incl. temporary ASIA*)
  { pattern: /(?:AKIA|ASIA)[0-9A-Z]{16}/, description: "AWS access key ID", severity: "block" },
  // Google API keys
  { pattern: /AIza[0-9A-Za-z_\-]{35}/, description: "Google API key", severity: "block" },
  // GitHub tokens
  { pattern: /(?:ghp|gho|ghu|ghs|ghr)_[0-9A-Za-z]{36}/, description: "GitHub token", severity: "block" },
  { pattern: /github_pat_[0-9A-Za-z_]{22,}/, description: "GitHub PAT", severity: "block" },
  // Slack tokens
  { pattern: /xox[abceprs]-[0-9A-Za-z-]{10,}/, description: "Slack token", severity: "block" },
  { pattern: /xapp-[0-9A-Za-z-]{10,}/, description: "Slack app token", severity: "block" },
  { pattern: /https:\/\/hooks\.slack\.com\/services\/T[A-Z0-9]+\/B[A-Z0-9]+\/[A-Za-z0-9]+/i, description: "Slack webhook URL", severity: "block" },
  // Stripe keys
  { pattern: /(?:sk|rk)_(?:live|test)_[0-9A-Za-z]{16,}/, description: "Stripe secret/restricted key", severity: "block" },
  { pattern: /whsec_[0-9A-Za-z]{16,}/, description: "Stripe webhook secret", severity: "block" },
  // GitLab personal access tokens
  { pattern: /glpat-[0-9A-Za-z_-]{20,}/, description: "GitLab PAT", severity: "block" },
  // JWTs / JWEs
  { pattern: /eyJ[A-Za-z0-9_-]+\.(?:[A-Za-z0-9_-]*\.)[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/, description: "JWE (incl. direct-encryption: empty key segment allowed)", severity: "block" },
  { pattern: /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{7,}/, description: "JWT", severity: "block" },
  // Bearer tokens (scheme is case-insensitive; opaque tokens may include + / ~ =)
  { pattern: /Bearer\s+[A-Za-z0-9._~+\/-]+\.[A-Za-z0-9._~+\/-]+\.[A-Za-z0-9._~+\/-]+/i, description: "Bearer token (JWT-style)", severity: "block" },
  { pattern: /Bearer\s+[A-Za-z0-9._~+\/=-]{16,}/i, description: "Bearer token (opaque)", severity: "block" },
  // Google OAuth access tokens
  { pattern: /ya29\.[0-9A-Za-z_-]+/, description: "Google OAuth access token", severity: "block" },
  // Google OAuth client secrets (standalone, distinctive GOCSPX- prefix)
  { pattern: /GOCSPX-[A-Za-z0-9_-]{20,}/, description: "Google OAuth client secret", severity: "block" },
  // OpenAI / Anthropic / HuggingFace / npm
  { pattern: /sk-(?:proj|svcacct|admin)-[0-9A-Za-z_-]{16,}/, description: "OpenAI project/service-account/admin key", severity: "block" },
  { pattern: /sk-[0-9A-Za-z]{20,}/, description: "OpenAI API key", severity: "block" },
  { pattern: /sk-ant-[0-9A-Za-z_-]{16,}/, description: "Anthropic API key", severity: "block" },
  { pattern: /hf_[0-9A-Za-z]{16,}/, description: "HuggingFace token", severity: "block" },
  { pattern: /npm_[0-9A-Za-z]{36}/, description: "npm token", severity: "block" },
  // HTTP Basic auth credentials
  { pattern: /Authorization:\s*Basic\s+[A-Za-z0-9+/=]{4,}/i, description: "HTTP Basic auth credential", severity: "block" },
  // Signed-URL credentials carried as query params (Azure SAS `sig`, AWS
  // `X-Amz-Signature`, GCS `X-Goog-Signature`, generic `signature`). These have no
  // userinfo and no provider prefix, so they are missed by the rules above. Match
  // the param + value, stopping at `&`/`#`/whitespace/EOF; the whole match is
  // removed (the signed URL becomes unusable but safe).
  { pattern: /(?:&(?:amp|#38|#x26);|[?&])(?:sig|signature|X-Amz-Signature|X-Goog-Signature)=[^\s&#]*/gi, description: "Signed-URL credential (query param, incl. HTML-escaped)", severity: "block" },
  // URIs with embedded credentials (userinfo), scheme-independent so non-HTTP
  // connection strings (postgresql://, redis://, mongodb://, …) are also covered.
  // Authority-bounded (stops at / ? #) and greedy through `@`, so empty-username,
  // password-only, username-only, and colon-bearing passwords are all covered:
  //   `https://:secret@h`  `https://token@h`  `https://user:@h`  `https://u:p:a:ss@h`
  // Redact only the userinfo, keeping the scheme+host, so
  // `https://alice:S3cret!@host/path` becomes `https://host/path` (no sentinel).
  { pattern: /(?<=:\/\/)[^\s/?#]+@/gi, description: "URI with embedded credentials (userinfo)", severity: "block" },
  // Generic credential assignments (redact the value, not the key).
  // `=` assignments are config-style → redact ANY non-space value for strong keys,
  //   at line start, inline, or namespaced (DB_PASSWORD, MY_API_KEY, clientSecret).
  // `:` strong key AT LINE START (config) → any value (catches `password: hunter2`).
  // `:` strong key INLINE → only quoted or secret-shaped values, sparing prose such
  //   as "token: represents a parsed unit" / "password: required".
  // Optional quote between key and colon handles JSON keys (`"password": "..."`).
  // `[ \t]*` (not `\s*`) keeps line anchors from crossing newlines.
  // Structural assignments (line-anchored, namespaced, YAML-list, camelCase)
  // consume a structured value (stops at `;`, `,`, `}`, `]`, or EOL), so unquoted
  // multi-word secrets are fully redacted while comma-separated siblings and
  // trailing log fields remain. Prose-mode (bare-lowercase line-start `:`) uses
  // shape-aware gating (INLINE_SECRET_SHORT) to preserve `token: represents …`.
  { pattern: new RegExp(`^[ \t]*(${STRONG_KEYS})[ \t]*=[ \t]*(${STRUCT_VALUE})`, "gim"), description: "Credential assignment (line=)", severity: "block" },
  // Line-anchored namespaced `=` (e.g. `DB_PASSWORD=correct horse battery staple`):
  // structural configuration. Placed BEFORE the generic inline `=` so the
  // namespace is not partially consumed.
  { pattern: new RegExp(`^[ \t]*(${NS_PREFIX})(${STRONG_KEYS})[ \t]*=[ \t]*(${STRUCT_VALUE})`, "gim"), description: "Credential assignment (line= namespaced)", severity: "block" },
  // Namespaced `=` with structured value: stops at `,` so comma-separated sibling
  // assignments (e.g. `DB_PASSWORD=hunter2, MY_API_KEY=abc123, mypassword=leak`)
  // are each redacted individually, while the non-namespaced `mypassword=leak`
  // is preserved (NS_BOUND fails inside the word). Placed BEFORE the generic
  // `=` so the namespace is not partially consumed.
  { pattern: new RegExp(`(${NS_BOUND})${NS_PREFIX}(${STRONG_KEYS})[ \t]*=[ \t]*(${STRUCT_VALUE})`, "giu"), description: "Credential assignment (namespaced =)", severity: "block" },
  // Generic `=`: NS_BOUND (excludes `._-`) so it does not eat into a namespace
  // (e.g. `DB_PASSWORD=...`); `=` is config-style (security-first) and redacts
  // any value, including prose-like `password=required`.
  { pattern: new RegExp(`(${NS_BOUND})(${STRONG_KEYS})[ \t]*=[ \t]*(${LINE_VALUE})`, "giu"), description: "Credential assignment (=)", severity: "block" },
  { pattern: new RegExp(`(${NS_BOUND})${NS_PREFIX}(${STRONG_KEYS})(?:["'])?[ \t]*:[ \t]*(${STRUCT_VALUE})`, "giu"), description: "Credential assignment (namespaced :)", severity: "block" },
  // Line-start bare-lowercase `:` is prose-mode: shape-aware (quoted or secret-shaped)
  // so `token: represents a parsed unit` / `password: required` at column 0 are
  // preserved. Structural line-start (namespaced/uppercase) is handled by the
  // namespaced `:` rule above.
  { pattern: new RegExp(`^[ \t]*(${STRONG_KEYS})(?:["'])?[ \t]*:[ \t]*(${INLINE_SECRET_SHORT})`, "gim"), description: "Credential assignment (line: prose-mode)", severity: "block" },
  // Inline `:` for strong keys: redact the value if quoted or secret-shaped
  // (digit/special). Length floor removed vs INLINE_SECRET so short secrets like
  // `hunter2`/`abc123` are caught; key-gating keeps `password: required` (no
  // digit/special) and `auth: OAuth2Authentication` (auth excluded) from matching.
  { pattern: new RegExp(`(${LBOUND})(${STRONG_KEYS_INLINE})(?:["'])?[ \t]*:[ \t]*(${INLINE_SECRET_SHORT})`, "giu"), description: "Credential assignment (:)", severity: "block" },
  // Quoted-key inline `:` (e.g. `"password": "hunter2"`) → redact the complete value.
  { pattern: new RegExp(`(${LBOUND})(?:["'])(${STRONG_KEYS})(?:["'])[ \t]*:[ \t]*(${LINE_VALUE})`, "giu"), description: "Credential assignment (quoted key :)", severity: "block" },
  // YAML-list inline `- key:` (e.g. `- clientSecret: abc123`) → structured value.
  { pattern: new RegExp(`^[ \t]*-[ \t]*(${STRONG_KEYS})(?:["'])?[ \t]*:[ \t]*(${STRUCT_VALUE})`, "gim"), description: "Credential assignment (list :)", severity: "block" },
  // camelCase compound keys (capitalized suffix) that STRONG_KEYS cannot anchor,
  // e.g. `dbPassword`, `githubToken`, `serviceApiKey`, `"myClientSecret": "..."`.
  // Case-SENSITIVE on the suffix (no `i`) so lowercase `mypassword` is excluded.
  { pattern: new RegExp(`(${LBOUND})(?:["'])?[a-zA-Z][a-zA-Z0-9]*?(?:${CAMEL_SUFFIX})(?:["'])?[ \t]*[=:][ \t]*(${STRUCT_VALUE})`, "gu"), description: "Credential assignment (camelCase)", severity: "block" },
  // Ambiguous key + `:` (inline): quoted or secret-shaped value required (noisy keys dropped).
  { pattern: new RegExp(`(${LBOUND})(${AMBIGUOUS_KEYS})(?:["'])?[ \t]*:[ \t]*(${INLINE_SECRET})`, "giu"), description: "Secret/token assignment", severity: "block" },
  // Ambiguous key + `=` (inline): same value restriction (e.g. `session_id=opaque-token`),
  // so `session=active` / `session=required` prose is preserved.
  { pattern: new RegExp(`(${LBOUND})(${AMBIGUOUS_KEYS})[ \t]*=[ \t]*(${INLINE_SECRET})`, "giu"), description: "Secret/token assignment (=)", severity: "block" },
];

