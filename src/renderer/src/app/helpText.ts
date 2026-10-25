/**
 * One place for what each button does, so every screen explains it the same way.
 * Plain language, no jargon. Keep each `short` to one sentence (it appears as a hint under or next to a button).
 */
export interface HelpEntry {
  label: string;
  /** One sentence. */
  short: string;
  /** A little more detail, shown in the "What does each button do?" panel. */
  long: string;
}

export const HELP = {
  practice: {
    label: 'Practice',
    short: 'Go through the whole exam once, question by question.',
    long: 'Asks every question in the exam one time. You see right or wrong straight away, then the official explanation. Use it for your first run through a new exam. Any question you get wrong goes into your mistake bank.',
  },
  master: {
    label: 'Master exam',
    short: 'Drill everything you have not mastered yet.',
    long: 'Builds a round from every question you have not mastered: ones you have not seen, and ones you have not answered correctly twice in a row. Keep doing rounds until the exam reaches 100%. Includes your missed questions, but also ones you only got right once.',
  },
  weak: {
    label: 'Weak points',
    short: 'Only the questions you got wrong in this exam.',
    long: 'Asks only the questions from this exam that are in your mistake bank. Get one right in two separate rounds and it leaves the bank. Get it wrong and it stays. This is the fastest way to fix mistakes.',
  },
  bank: {
    label: 'Mistake bank',
    short: 'Missed questions from all your exams, mixed together.',
    long: 'Every question you have missed, from every exam, in one mixed drill. Each question appears once per round. A question leaves the bank after you answer it correctly in two separate rounds, and comes straight back if you miss it again.',
  },
  stats: {
    label: 'Stats',
    short: 'See your weakest questions and how each round went.',
    long: 'Shows accuracy and time for every question, your weakest questions first, and a chart of your rounds.',
  },
  reset: {
    label: 'Reset progress',
    short: 'Forget your answers for this exam, keep the questions.',
    long: 'Clears your answers and mistake bank for this exam so you can start it fresh. The questions stay.',
  },
  delete: {
    label: 'Delete',
    short: 'Remove this exam and all its progress.',
    long: 'Deletes the exam, its questions and your progress from this computer. You can import the PDF again later.',
  },
} as const satisfies Record<string, HelpEntry>;

/** How questions enter and leave the mistake bank. Shown on bank-related screens. */
export const BANK_RULE =
  'A question goes into the mistake bank when you get it wrong. It leaves after you answer it correctly in two separate rounds. If you miss it again, it goes back in.';
