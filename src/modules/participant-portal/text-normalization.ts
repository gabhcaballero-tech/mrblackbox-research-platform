const emojiPattern =
  /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{1F3FB}-\u{1F3FF}\uFE0F\u200D\u20E3]/gu;
const spacingControlPattern = /[\u0000-\u001F\u007F-\u009F]/g;
const invisibleFormatPattern = /[\u00AD\u034F\u061C\u180E\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g;

export function stripEmoji(value: string): string {
  return value.replace(emojiPattern, "");
}

export function normalizeParticipantTextInput(value: string): string {
  return stripEmoji(value)
    .replace(invisibleFormatPattern, "")
    .replace(spacingControlPattern, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleUpperCase("es-MX");
}
