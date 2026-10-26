// Game tooltip strings contain a small amount of presentational HTML. Publish
// plain text only, retaining line breaks without trusting upstream markup.
export function itemText(value) {
  return String(value)
    .replace(/<br\s*\/?\s*>|<\/li\s*>|<\/p\s*>/gi, "\n")
    .replace(/<li(?:\s[^>]*)?>/gi, "- ")
    .replace(/<\/?[A-Za-z][^>]{0,2048}>/g, "")
    .replace(
      /&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi,
      (whole, entity) => {
        const named = {
          amp: "&",
          lt: "<",
          gt: ">",
          quot: '"',
          apos: "'",
          nbsp: " ",
        };
        if (entity[0] !== "#") return named[entity.toLowerCase()] ?? whole;
        const number =
          entity[1].toLowerCase() === "x"
            ? parseInt(entity.slice(2), 16)
            : Number(entity.slice(1));
        return number > 0 &&
          number <= 0x10ffff &&
          !(number >= 0xd800 && number <= 0xdfff)
          ? String.fromCodePoint(number)
          : "";
      },
    )
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
