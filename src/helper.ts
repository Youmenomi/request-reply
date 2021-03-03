export type DuplicatePropertyNames<TObject, TSource> = keyof TObject &
  keyof TSource;
export type DPNames<TObject, TSource> = DuplicatePropertyNames<
  TObject,
  TSource
>;

export type Subtract<TSubtract, TSubtracted> = Omit<
  TSubtracted,
  keyof TSubtract
>;

export type IndexType = string | number | symbol;

/* istanbul ignore next */
export function report() {
  return new Error('[request-reply] Please report this bug to the author.');
}
