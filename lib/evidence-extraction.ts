export function findEvidenceSentence(source: string) {
  const sentences = source.match(/[^.!?]+(?:[.!?]|$)/g) ?? [source];
  return sentences.find((sentence) =>
    /\bevidence\s*:/i.test(sentence) ||
    /\b(?:customer|prospect|participant|interviewee|user|buyer|respondent|tester)\b[^.!?]{0,100}\b(?:paid|paying|offered to pay|willing to pay|purchased|preordered|interviewed|reported)\b/i.test(sentence) ||
    /\b(?:interviewed|observed|tested|surveyed|measured|validated)\b/i.test(sentence)
  )?.trim();
}
