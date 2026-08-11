import { adjectives, animals, uniqueNamesGenerator } from "unique-names-generator";

/**
 * Случайное отображаемое имя вида «Swift Falcon» — используется как имя
 * участника по умолчанию, если он ещё не задавал собственное имя для этой роли.
 */
export function generateParticipantName(): string {
  return uniqueNamesGenerator({
    dictionaries: [adjectives, animals],
    separator: " ",
    style: "capital",
  });
}
