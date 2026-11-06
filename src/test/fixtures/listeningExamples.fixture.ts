// Golden B1 example sentences and malformed variants — plan.md Section 3.2.
import type { NewListeningExample, PhoneticCategory } from '../../types/listening.js';

function ex(
  sentence: string,
  target: string,
  simulated: string,
  noteZh: string,
  noteEn: string
): NewListeningExample {
  return {
    sentence,
    tts_sentence: sentence,
    target_phrase_in_sentence: target,
    simulated_pronunciation: simulated,
    phonetic_note_zh: noteZh,
    phonetic_note_en: noteEn,
    lexile_level: 'B1',
    is_validated: true,
  };
}

/** Valid 3-sentence B1 batches, one per category. Every target phrase is a substring of its sentence. */
export const GOLDEN_B1_EXAMPLES_BY_CATEGORY: Record<PhoneticCategory, NewListeningExample[]> = {
  catenation: [
    ex('Come in and sit down.', 'in and', 'i-nand', 'in 与 and 连读。', '"in" links into "and".'),
    ex(
      'Pick it up, please.',
      'Pick it up',
      'pi-ki-tup',
      '辅音与元音连读。',
      'Consonants link into the following vowels.'
    ),
    ex(
      'Turn it off before you leave.',
      'Turn it off',
      'tur-ni-toff',
      '三个词连成一串。',
      'Three words link into one chunk.'
    ),
  ],
  assimilation: [
    ex(
      'Would you like some coffee before we start?',
      'Would you',
      'woul-dja',
      '/d/+/j/ 变成 /dʒ/。',
      '/d/ + /j/ becomes /dʒ/.'
    ),
    ex(
      'Would you mind opening the window for a minute?',
      'Would you',
      'woul-dja',
      '/d/+/j/ 变成 /dʒ/。',
      '/d/ + /j/ becomes /dʒ/.'
    ),
    ex(
      'Where would you go if you had a free weekend?',
      'would you',
      'woul-dja',
      '/d/+/j/ 变成 /dʒ/。',
      '/d/ + /j/ becomes /dʒ/.'
    ),
  ],
  elision: [
    ex(
      'What is the next step for us?',
      'next step',
      'nex-step',
      '中间的 /t/ 省略。',
      'The middle /t/ is dropped.'
    ),
    ex(
      'I left my phone at home last night.',
      'last night',
      'las-night',
      '/t/ 在辅音前省略。',
      '/t/ drops before a consonant.'
    ),
    ex(
      'She just wanted to help.',
      'just wanted',
      'jus-wanted',
      '/t/ 在辅音前省略。',
      '/t/ drops before a consonant.'
    ),
  ],
  weak_forms: [
    ex(
      'You could have called me first.',
      'could have',
      'could-a',
      'have 弱化为 /ə/。',
      '"have" reduces to /ə/.'
    ),
    ex(
      'We should have left earlier.',
      'should have',
      'should-a',
      'have 弱化为 /ə/。',
      '"have" reduces to /ə/.'
    ),
    ex(
      'I would have helped you.',
      'would have',
      'would-a',
      'have 弱化为 /ə/。',
      '"have" reduces to /ə/.'
    ),
  ],
  h_dropping: [
    ex(
      'I saw him at the station.',
      'saw him',
      "saw 'im",
      'him 的 /h/ 脱落。',
      'The /h/ in "him" drops.'
    ),
    ex(
      'Tell her I said hello.',
      'Tell her',
      "tell 'er",
      'her 的 /h/ 脱落。',
      'The /h/ in "her" drops.'
    ),
    ex(
      'Did he finish his dinner?',
      'Did he',
      "did 'e",
      'he 的 /h/ 脱落。',
      'The /h/ in "he" drops.'
    ),
  ],
  contractions: [
    ex(
      "I'm going to call my mum tonight.",
      'going to',
      'gonna',
      'going to 缩约为 gonna。',
      '"going to" becomes "gonna".'
    ),
    ex(
      'Do you want to watch a film?',
      'want to',
      'wanna',
      'want to 缩约为 wanna。',
      '"want to" becomes "wanna".'
    ),
    ex(
      'I have got to go now.',
      'have got to',
      'gotta',
      'have got to 缩约为 gotta。',
      '"have got to" becomes "gotta".'
    ),
  ],
  confusion: [
    ex(
      'We learned about the Magna Carta at school.',
      'Magna Carta',
      'Mag-na Car-ta',
      '容易误听为 Magma Cara。',
      'Easily misheard as "Magma Cara".'
    ),
    ex(
      'Can you hear the difference between ship and sheep?',
      'ship and sheep',
      'ship / sheep',
      '/ɪ/ 与 /iː/ 易混淆。',
      '/ɪ/ and /iː/ are easy to confuse.'
    ),
    ex(
      'I can come, but I can’t stay long.',
      'can’t',
      'kahnt',
      'can 与 can’t 易混淆。',
      '"can" and "can\'t" are easy to confuse.'
    ),
  ],
};

/** Unclosed JSON array (simulated token-limit truncation) for repair/recovery tests. */
export const TRUNCATED_JSON_RESPONSE =
  '[{"category":"assimilation","phrase":"did you","spoken_phrase":"did you","simulated_pronunciation":"di-dja"},{"category":"elision","phrase":"next step","spoken_phrase":"nex';

/** Batch that validateExampleBatch must reject: target phrase missing, and C2-level vocabulary. */
export const INVALID_B1_EXAMPLE_BATCH: NewListeningExample[] = [
  ex(
    'Did they arrive on time?',
    'did you',
    'di-dja',
    '目标短语缺失。',
    'Target phrase is missing.'
  ),
  ex(
    'Theses epistemological presuppositions obfuscate the ontological substrate, did you notice?',
    'did you',
    'di-dja',
    '词汇超出 B1。',
    'Vocabulary is far above B1.'
  ),
  ex('Did you see the film?', 'Did you', 'di-dja', '有效句子。', 'Valid sentence.'),
];
