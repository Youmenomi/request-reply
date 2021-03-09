import { Form, Listener, Pichu } from 'pichu';
import PQueue, { Options } from 'p-queue';
import { DPNames, IndexType, Subtract } from './helper';
import autoBind from 'auto-bind';
import { CatchFirst, safeAwait } from 'catch-first';

export type { Form, Listener } from 'pichu';

export type Reducer = (accumulator: any, answer: any, index: number) => any;
type Fusion<TForm extends Form<TForm>, TForm2 extends Form<TForm2>> = {
  [key in keyof Subtract<TForm2, TForm>]: TForm[key];
} &
  {
    [key in keyof Subtract<TForm, TForm2>]: TForm2[key];
  } &
  {
    [key in DPNames<TForm2, TForm>]: TForm[key] extends TForm2[key]
      ? TForm[key]
      : Listener;
  };

type Emitter = Omit<
  Pichu,
  'emit' | 'thunderShock' | 'thunderPunch' | 'thunderbolt' | 'dispose'
>;

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
          : Listener;
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
  protected _eventMap = new Map<IndexType, Set<Listener>>();
  protected _before = new Pichu();
  protected _after = new Pichu();

  constructor() {
    autoBind(this);
  }

  protected add(event: IndexType) {
    let listeners = this._eventMap.get(event);
    if (listeners) {
      return listeners;
    }
    listeners = new Set();
    this._eventMap.set(event, listeners);
    return listeners;
  }

  get before() {
    return (this._before as Emitter) as Before<TFusion>;
  }

  get after() {
    return (this._after as Emitter) as After<TForm, TForm2>;
  }

  reply<T extends keyof TFusion>(
    name: T,
    resolve:
      | TFusion[T]
      | ((...args: Parameters<TFusion[T]>) => Promise<ReturnType<TFusion[T]>>)
  ) {
    const listeners = this.add(name);
    if (!listeners.has(resolve)) {
      listeners.add(resolve);
    } else {
      if (process.env.NODE_ENV === 'development')
        console.warn(
          `[request-reply] Invalid operation, there is a duplicate resolve in reply.`
        );
    }
  }

  unreply<T extends keyof TFusion>(
    name: T,
    resolve:
      | TFusion[T]
      | ((...args: Parameters<TFusion[T]>) => Promise<ReturnType<TFusion[T]>>)
  ) {
    const listeners = this._eventMap.get(name);
    if (!listeners) return;
    listeners.forEach((listener) => {
      if (resolve === listener) {
        listeners.delete(resolve);
      }
    });
  }

  by(
    reducer: Reducer,
    options: Options<any, any> & { catchError: boolean } = {
      catchError: false,
    }
  ) {
    const { catchError } = options;
    return async <T extends keyof TFusion>(
      name: T,
      ...args: Parameters<TFusion[T]>
    ) => {
      const listeners = this._eventMap.get(name);
      if (!listeners) {
        throw new Error(
          `[request-reply] No reply to the request named ${name}.`
        );
      }

      this._before.emit(name, ...args);

      let empty = true;
      let response: any = [];
      const queue = new PQueue(options);
      const promises: Promise<any>[] = [];
      let index = -1;
      listeners.forEach((resolve) => {
        index++;
        empty = false;
        promises.push(
          queue.add(
            ((index) => async () => {
              const result = await safeAwait(Promise.resolve(resolve(...args)));
              if (result.length === CatchFirst.caught) {
                if (catchError === true) {
                  response = await reducer(response, result[0], index);
                } else {
                  queue.pause();
                  queue.clear();
                  throw result[0];
                }
              } else {
                response = await reducer(response, result[1], index);
              }
            })(index)
          )
        );
      });
      if (empty) {
        throw new Error(
          `[request-reply] No reply to the request named ${name}.`
        );
      }
      await Promise.all(promises);

      this._after.emit<any>(name, response);

      return response;
    };
  }

  async one<T extends keyof TFusion>(
    name: T,
    ...args: Parameters<TFusion[T]>
  ): Promise<ReturnType<TFusion[T]>> {
    const listeners = this._eventMap.get(name);
    if (listeners && listeners.size > 1) {
      throw new Error(
        `[request-reply] The handler of request.one() only allows one reply.`
      );
    }
    return await this.by(oneReducer)(name, ...args);
  }

  async all<T extends keyof TFusion>(
    name: T,
    ...args: Parameters<TFusion[T]>
  ): Promise<ReturnType<TFusion[T]>[]> {
    return await this.by(allReducer)(name, ...args);
  }

  async raceAll<T extends keyof TFusion>(
    name: T,
    ...args: Parameters<TFusion[T]>
  ): Promise<ReturnType<TFusion[T]>[]> {
    return await this.by(raceReducer)(name, ...args);
  }

  async many<T extends keyof TFusion>(
    num: number,
    name: T,
    ...args: Parameters<TFusion[T]>
  ): Promise<ReturnType<TFusion[T]>[]> {
    this.checkMany(num, name);
    return await this.by(allReducer)(name, ...args);
  }

  async raceMany<T extends keyof TFusion>(
    num: number,
    name: T,
    ...args: Parameters<TFusion[T]>
  ): Promise<ReturnType<TFusion[T]>[]> {
    this.checkMany(num, name);
    return await this.by(raceReducer)(name, ...args);
  }

  protected checkMany(num: number, name: IndexType) {
    const listeners = this._eventMap.get(name);
    if (listeners && listeners.size !== num) {
      throw new Error(
        `[request-reply] Different from the specified number of replies.`
      );
    }
  }

  dispose() {
    this._eventMap.clear();
    //@ts-expect-error
    this._eventMap = undefined;

    this._before.dispose();
    //@ts-expect-error
    this._before = undefined;

    this._after.dispose();
    //@ts-expect-error
    this._after = undefined;
  }
}
