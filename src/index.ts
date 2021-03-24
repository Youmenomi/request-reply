import { Form, Listener, Pichu } from 'pichu';
import PQueue, { Options } from 'p-queue';
import { DPNames, IndexType, Subtract } from './helper';
import autoBind from 'auto-bind';
import { CatchFirst, safeAwait } from 'catch-first';
import { Hydreigon } from 'hydreigon';

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

enum Mode {
  on,
  once,
  asyncOnce,
}

enum Search {
  event = 'event',
  listener = 'listener',
  group = 'group',
}

let __debug_listening_count = 0;
export function __debug_get_listening_count() {
  return __debug_listening_count;
}
export function __debug_clear_listening_count() {
  return (__debug_listening_count = 0);
}

class Listen {
  _isOnce = false;
  get isOnce() {
    return this._isOnce;
  }

  constructor(
    public event: IndexType,
    public listener: Listener,
    public mode: Mode,
    public group: any
  ) {
    this._isOnce = this.mode !== Mode.on;
    __debug_listening_count++;
  }
  same(event: IndexType, listener: Listener) {
    return event === this.event && listener === this.listener;
  }
  async exec(...arg: any[]) {
    return this.listener(...arg);
  }
  dispose() {
    //@ts-expect-error
    this.listener = undefined;
    this.group = undefined;

    __debug_listening_count--;
  }
}

export class Request<
  TForm extends Form<TForm> = Form<any>,
  TForm2 extends Form<TForm2> = Form<unknown>,
  TFusion extends Form<TFusion> = Fusion<TForm, TForm2>
> {
  protected _indexer = new Hydreigon(
    Search.event,
    Search.listener,
    Search.group
  ).knock<Listen>();
  protected _before = new Pichu();
  protected _after = new Pichu();

  constructor() {
    autoBind(this);
  }

  protected add(event: IndexType, listener: Listener, mode: Mode, group: any) {
    if (
      this._indexer.search(Search.event, event, true).some((listen) => {
        return listen.listener === listener;
      })
    ) {
      if (process.env.NODE_ENV === 'development')
        console.warn(
          '[request-reply] Invalid operation, there is a duplicate resolve in reply.'
        );
      return null;
    }
    const listen = new Listen(event, listener, mode, group);
    this._indexer.add(listen);
    return listen;
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
      | ((...args: Parameters<TFusion[T]>) => Promise<ReturnType<TFusion[T]>>),
    group?: any
  ) {
    return !!this.add(name, resolve, Mode.on, group);
  }

  replyOnce<T extends keyof TFusion>(
    name: T,
    resolve:
      | TFusion[T]
      | ((...args: Parameters<TFusion[T]>) => Promise<ReturnType<TFusion[T]>>),
    group?: any
  ) {
    return !!this.add(name, resolve, Mode.once, group);
  }

  unreply<T extends keyof TFusion>(
    name: T,
    resolve:
      | TFusion[T]
      | ((...args: Parameters<TFusion[T]>) => Promise<ReturnType<TFusion[T]>>)
  ) {
    this._indexer.search(Search.event, name, true).some((listen) => {
      if (listen.same(name, resolve)) {
        this._indexer.remove(listen);
        listen.dispose();
        return true;
      } else return false;
    });
  }

  unreplyGroup(group: any): void;
  unreplyGroup<T extends keyof TFusion>(
    group: any,
    resolve: (
      ...args: Parameters<TFusion[T]>
    ) => Promise<ReturnType<TFusion[T]>>
  ): void;
  unreplyGroup(group: any, name: keyof TForm): void;
  unreplyGroup(group: any, nameOrResolve?: keyof TForm | Listener) {
    if (group === undefined) {
      throw new Error('[request-reply] "undefined" is not a valid parameter.');
    }
    if (nameOrResolve === undefined) {
      this._indexer.search(Search.group, group).forEach((listen) => {
        this._indexer.remove(listen);
        listen.dispose();
      });
    } else if (typeof nameOrResolve === 'function') {
      this._indexer.search(Search.group, group).forEach((listen) => {
        if (nameOrResolve === listen.listener) {
          this._indexer.remove(listen);
          listen.dispose();
        }
      });
    } else {
      this._indexer.search(Search.group, group).forEach((listen) => {
        if (nameOrResolve === listen.event) {
          this._indexer.remove(listen);
          listen.dispose();
        }
      });
    }
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
      const listens = this._indexer.search(Search.event, name);
      if (listens.size === 0) {
        throw new Error(
          `[request-reply] No reply to the request named "${name}".`
        );
      }

      this._before.emit(name, ...args);

      let response: any = [];
      const queue = new PQueue(options);
      const promises: Promise<any>[] = [];
      let index = -1;
      this._indexer.tie(listens);
      listens.forEach((listen) => {
        index++;
        promises.push(
          queue.add(
            ((index) => async () => {
              let result: [unknown] | [null, any];
              if (listen.isOnce) {
                this._indexer.remove(listen);
                result = await safeAwait(listen.exec(...args));
                listen.dispose();
              } else {
                result = await safeAwait(listen.exec(...args));
              }
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
      this._indexer.untie(listens);
      await Promise.all(promises);

      this._after.emit<any>(name, response);

      return response;
    };
  }

  async one<T extends keyof TFusion>(
    name: T,
    ...args: Parameters<TFusion[T]>
  ): Promise<ReturnType<TFusion[T]>> {
    if (this._indexer.searchSize(Search.event, name) > 1) {
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
    if (this._indexer.searchSize(Search.event, name) !== num) {
      throw new Error(
        `[request-reply] Different from the specified number of replies.`
      );
    }
  }

  dispose() {
    this._indexer.dispose();
    //@ts-expect-error
    this._indexer = undefined;

    this._before.dispose();
    //@ts-expect-error
    this._before = undefined;

    this._after.dispose();
    //@ts-expect-error
    this._after = undefined;
  }
}
