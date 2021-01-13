import { Pichu } from 'pichu';
import pMap, { Options } from 'p-map';
import { DPNames, Subtract } from './helper';
import autoBind from 'auto-bind';

type Resolve = (...args: any[]) => any;
type Resolves = Resolve[];
export type Reducer = (accumulator: any, answer: any, index: number) => any;
type Form<TForm> = { [key in keyof TForm]: Resolve };
type Fusion<TForm extends Form<TForm>, TForm2 extends Form<TForm2>> = {
  [key in keyof Subtract<TForm2, TForm>]: TForm[key];
} &
  {
    [key in keyof Subtract<TForm, TForm2>]: TForm2[key];
  } &
  {
    [key in DPNames<TForm2, TForm>]: TForm[key] extends TForm2[key]
      ? TForm[key]
      : Resolve;
  };

type Before<TForm extends Form<TForm>> = Omit<
  Pichu<TForm>,
  'emit' | 'thunderShock' | 'thunderPunch' | 'thunderbolt' | 'dispose'
>;

type After<TForm extends Form<TForm>, TForm2 extends Form<TForm2>> = Omit<
  Pichu<
    {
      [key in keyof Subtract<TForm2, TForm>]: (
        response: ReturnType<TForm[key]>
      ) => any;
    } &
      {
        [key in keyof Subtract<TForm, TForm2>]: (
          response: ReturnType<TForm2[key]>[]
        ) => any;
      } &
      {
        [key in DPNames<TForm2, TForm>]: TForm[key] extends TForm2[key]
          ? (response: ReturnType<TForm[key]> | ReturnType<TForm[key]>[]) => any
          : Resolve;
      }
  >,
  'emit' | 'thunderShock' | 'thunderPunch' | 'thunderbolt' | 'dispose'
>;

const oneReducer: Reducer = async (accumulator: any, answer: any) => {
  return answer;
};
const allReducer: Reducer = async (
  accumulator: any,
  answer: any,
  index: number
) => {
  accumulator[index] = answer;
  return accumulator;
};
const raceReducer: Reducer = async (accumulator: any, answer: any) => {
  accumulator.push(answer);
  return accumulator;
};

export class Request<
  TForm extends Form<TForm> = Form<any>,
  TForm2 extends Form<TForm2> = Form<unknown>,
  TFusion extends Form<TFusion> = Fusion<TForm, TForm2>
> {
  protected _directory = new Map<string, Resolves>();
  protected _before = new Pichu();
  protected _after = new Pichu();

  constructor() {
    autoBind(this);
  }

  protected target(event: string, create?: false): Resolves | undefined;
  protected target(event: string, create: true): Resolves;
  protected target(event: string, create = false) {
    let target = this._directory.get(event);
    if (target) {
      return target;
    } else if (create) {
      target = [];
      this._directory.set(event, target);
      return target;
    } else {
      return undefined;
    }
  }

  get before(): Before<TFusion> {
    return this._before;
  }

  get after(): After<TForm, TForm2> {
    return this._after;
  }

  reply<T extends keyof TFusion & string>(
    name: T,
    resolve:
      | TFusion[T]
      | ((...args: Parameters<TFusion[T]>) => Promise<ReturnType<TFusion[T]>>)
  ) {
    this.target(name, true).push(resolve);
  }

  by(reducer: Reducer, options?: Options) {
    return async <T extends keyof TFusion & string>(
      name: T,
      ...args: Parameters<TFusion[T]>
    ) => {
      const target = this.target(name);
      if (!target) {
        throw new Error(
          `[request-reply] No reply to the request named ${name}.`
        );
      }

      this._before.emit(name, ...args);

      let response: any = [];
      await pMap(
        target,
        (resolve, index) => {
          return (async () => {
            response = await reducer(response, await resolve(...args), index);
          })();
        },
        options
      );

      this._after.emit(name, response);

      return response;
    };
  }

  async one<T extends keyof TFusion & string>(
    name: T,
    ...args: Parameters<TFusion[T]>
  ): Promise<ReturnType<TFusion[T]>> {
    const target = this.target(name);
    if (target && target.length !== 1) {
      throw new Error(
        `[request-reply] The handler of request.one() only allows one reply.`
      );
    }
    return await this.by(oneReducer)(name, ...args);
  }

  async all<T extends keyof TFusion & string>(
    name: T,
    ...args: Parameters<TFusion[T]>
  ): Promise<ReturnType<TFusion[T]>[]> {
    return await this.by(allReducer)(name, ...args);
  }

  async raceAll<T extends keyof TFusion & string>(
    name: T,
    ...args: Parameters<TFusion[T]>
  ): Promise<ReturnType<TFusion[T]>[]> {
    return await this.by(raceReducer)(name, ...args);
  }

  async many<T extends keyof TFusion & string>(
    num: number,
    name: T,
    ...args: Parameters<TFusion[T]>
  ): Promise<ReturnType<TFusion[T]>[]> {
    this.checkMany(num, name);
    return await this.by(allReducer)(name, ...args);
  }

  async raceMany<T extends keyof TFusion & string>(
    num: number,
    name: T,
    ...args: Parameters<TFusion[T]>
  ): Promise<ReturnType<TFusion[T]>[]> {
    this.checkMany(num, name);
    return await this.by(raceReducer)(name, ...args);
  }

  protected checkMany(num: number, name: string) {
    const target = this.target(name);
    if (target && target.length !== num) {
      throw new Error(
        `[request-reply] Different from the specified number of replies.`
      );
    }
  }

  dispose() {
    this._directory.clear();
    //@ts-expect-error
    this._directory = undefined;

    this._before.dispose();
    //@ts-expect-error
    this._before = undefined;

    this._after.dispose();
    //@ts-expect-error
    this._after = undefined;
  }
}
