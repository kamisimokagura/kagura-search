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
