// The product fields requested from the OFF API: exactly what
// normalizeOffProduct reads, so responses stay small (a full OFF product
// record carries hundreds of fields). normalize.ts types its reads against
// this list, so reading a field that is not requested fails the typecheck.

export const OFF_FIELDS = [
  'code',
  'product_name',
  'product_name_en',
  'brands',
  'quantity',
  'nutriments',
  'ingredients_text',
  'ingredients_text_en',
  'additives_tags',
  'additives_n',
  'nova_group',
  'categories_tags',
  'image_front_url',
  'image_url',
  'last_modified_t',
] as const;

export type OffField = (typeof OFF_FIELDS)[number];
