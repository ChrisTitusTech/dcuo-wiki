import test from "node:test";
import assert from "node:assert/strict";
import { catalogBody, classifyCatalog } from "../scripts/catalog-classify.mjs";
const classify = (title, markdown) => classifyCatalog({ markdown }, title);
test("source-defined types take precedence over incidental navigation and feat lists", () => {
  assert.equal(
    classify(
      "Zod_Emblem",
      "The Zod Emblem is a rare emblem.\n## Feats\nCollect all styles.",
    ).category,
    "Equipment",
  );
  assert.equal(
    classify("Plans:_Example", "A rare R&D plan.").type,
    "R&D plans",
  );
  assert.equal(
    classify("Base_Items:_Amenities", "Amenities for your base.").category,
    "Housing",
  );
  assert.equal(
    classify(
      "Batgirl",
      "Cassandra Cain is Batgirl.\n## Combat Statistics\nDamage.",
    ).category,
    "Characters",
  );
  assert.equal(
    classify(
      "Ace_Chemicals",
      "Ace Chemicals is a prominent chemical factory in Gotham.",
    ).category,
    "Locations",
  );
  assert.equal(
    classify(
      "DCUO:_Year_One",
      "DCUO: Year One was a mission automatically appearing in the journal.",
    ).category,
    "Quests",
  );
  assert.equal(
    classify("Hotfix_18/09/21", "Fixed an instance.").category,
    "Updates",
  );
});
test("navigation templates cannot supply substance or type evidence", () => {
  const md =
    "A short entry.\n\n| [v](https://dcuniverseonline.fandom.com/wiki/Template:Items) |\n| --- |\n| This is a powerful weapon and artifact. |\n\n## Notes\nActual note.";
  assert.equal(catalogBody(md), "A short entry.\n\n\n## Notes\nActual note.");
  assert.equal(classify("Unknown", md).category, "Reference");
});
test("quest references do not turn vendors, styles or investigations into quests", () => {
  assert.equal(
    classify(
      "John_Constantine_(Vendor)",
      "John Constantine offers an artifact mission.\n## Objectives\nSpeak to him.\n## Rewards\nArtifacts.",
    ).category,
    "Characters",
  );
  assert.equal(
    classify(
      "Bright_Booster",
      "Bright Booster is a costume style set available after a mission.\n## Objectives\nCollect it.\n## Rewards\nA feat.",
    ).category,
    "Equipment",
  );
  assert.equal(
    classify(
      "Amulets_of_Memory_(Investigations)",
      "A collection of investigations in a mission.\n## Objectives\nCollect them.\n## Rewards\nA style.",
    ).category,
    "Collectibles",
  );
  assert.equal(
    classify(
      "Example_Mission",
      "Example Mission is a level 30 hero exclusive mission in Gotham City which rewards an item.",
    ).category,
    "Quests",
  );
});
test("vendor identity and housing namespaces override incidental raid and location mentions", () => {
  for (const [title, markdown] of [
    [
      "Apokolips_Logistics_Terminal_(Vendor)",
      "Apokolips Logistics Terminal is a vendor while doing an operation and a raid.",
    ],
    [
      "Blue_Beetle_(Vendor)",
      "Blue Beetle is a vendor in the Dakota City open world zone.",
    ],
    [
      "Vendor_Without_Suffix",
      "The robot is a vendor selling equipment in a raid.",
    ],
  ])
    assert.deepEqual(
      [classify(title, markdown).category, classify(title, markdown).type],
      ["Characters", "Vendors"],
    );
  assert.equal(
    classify(
      "Amenity:_Soder_Vendor",
      "Amenity: Soder Vendor is an epic base item.",
    ).category,
    "Housing",
  );
  assert.equal(
    classify(
      "Amenity:_Teleporter",
      "Amenity: Teleporter is a base item. Equipment mods add destinations.",
    ).category,
    "Housing",
  );
  assert.equal(
    classify("Base_Items:_Vendor", "This item depicts a vendor.").category,
    "Housing",
  );
});
