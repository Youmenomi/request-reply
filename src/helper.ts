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
