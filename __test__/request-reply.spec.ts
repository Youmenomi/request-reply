import {
  Request,
  __debug_clear_listening_count,
  __debug_get_listening_count,
} from '../src';
import {
  RequestForm,
  RequestName,
  getResolve,
  getCustomRequest,
  delay,
  getResolveNum,
} from './helper';

const env = process.env;

describe('request-reply', () => {
  const warn = jest
    .spyOn(global.console, 'warn')
    .mockImplementation(() => true);
  let request: Request<RequestForm>;
  let before: jest.Mock<number, [number]>;
  let after: jest.Mock<number, [number]>;

  beforeEach(() => {
    process.env = { ...env };
    warn.mockClear();

    request = new Request();
    before = jest.fn((data) => {
      return data;
    });
    after = jest.fn((data) => {
      return data;
    });
    request.before.on(RequestName.Count, before);
    request.after.on(RequestName.Count, after);
  });

  it('debug', async () => {
    const request = new Request();
    request.replyOnce('test1', () => '');
    request.replyOnce('test2', () => '', 'g1');
    request.reply('test1', () => '');
    request.reply('test2', () => '', 'g2');
    expect(getResolveNum(request, 'test1')).toBe(2);
    expect(getResolveNum(request, 'test2')).toBe(2);
    expect(__debug_get_listening_count()).toBe(4);
    __debug_clear_listening_count();
    expect(__debug_get_listening_count()).toBe(0);
  });

  it('request.replyOnce', async () => {
    {
      const func = jest.fn((e) => e);
      const request = new Request();
      request.replyOnce('test', () => func('replyOnce1'));
      expect(getResolveNum(request, 'test')).toBe(1);

      expect(await request.one('test', {})).toEqual('replyOnce1');
      expect(getResolveNum(request, 'test')).toBe(0);
    }
    {
      const func = jest.fn((e) => e);
      const request = new Request();
      request.replyOnce('test', func);
      expect(getResolveNum(request, 'test')).toBe(1);
      request.unreply('test', func);
    }
  });

  it('group', async () => {
    {
      const func = jest.fn((e) => e);
      const request = new Request();
      request.reply('test', () => func('reply1'), 'g1');
      request.reply('test', () => func('reply2'), 'g2');
      request.replyOnce('test', () => func('replyOnce1'), 'g2');
      request.replyOnce('test', () => func('replyOnce2'), 'g3');

      request.unreplyGroup('g1', 'non-exist');

      request.unreplyGroup('g2', 'test');
      expect(getResolveNum(request, 'test')).toBe(2);
      expect(await request.all('test', {})).toEqual(['reply1', 'replyOnce2']);
      expect(getResolveNum(request, 'test')).toBe(1);
      request.unreplyGroup('g1');
      expect(getResolveNum(request, 'test')).toBe(0);
    }
    {
      const func = jest.fn((e) => e);
      const request = new Request();
      const f1 = () => func('f1');
      const f2 = () => func('f2');
      request.reply('test1', f1, 'g');
      request.reply('test1', f2, 'g');
      request.replyOnce('test2', f1, 'g');
      request.replyOnce('test2', f2, 'g');

      request.unreplyGroup('g', f1);
      expect(getResolveNum(request, 'test1')).toBe(1);
      expect(getResolveNum(request, 'test2')).toBe(1);
      expect(await request.all('test1', {})).toEqual(['f2']);
      expect(await request.all('test2', {})).toEqual(['f2']);
      expect(getResolveNum(request, 'test1')).toBe(1);
      expect(getResolveNum(request, 'test2')).toBe(0);
      request.unreplyGroup('g');
      expect(getResolveNum(request, 'test1')).toBe(0);
    }
  });

  it('request.unreply', async () => {
    request.unreply(RequestName.Login, (user: string, password: string) => {
      user;
      password;
      return true;
    });

    request.reply(
      RequestName.Login,
      async function f1(user: string, password: string) {
        user;
        password;
        request.unreply(RequestName.Login, f1);
        await delay(100);
        return true;
      }
    );
    expect(getResolveNum(request, RequestName.Login)).toBe(1);
    request.one(RequestName.Login, '', '');
    expect(getResolveNum(request, RequestName.Login)).toBe(0);
    await expect(
      async () => await request.one(RequestName.Login, '', '')
    ).rejects.toThrowError(
      '[request-reply] No reply to the request named "login".'
    );
    expect(getResolveNum(request, RequestName.Login)).toBe(0);
    await delay(200);
    expect(getResolveNum(request, RequestName.Login)).toBe(0);

    async function f2(user: string, password: string) {
      user;
      password;
      await delay(100);
      return true;
    }
    request.reply(RequestName.Login, f2);
    async function f3(user: string, password: string) {
      user;
      password;
      await delay(100);
      return true;
    }
    request.reply(RequestName.Login, f3);
    expect(getResolveNum(request, RequestName.Login)).toBe(2);
    request.all(RequestName.Login, '', '');
    request.all(RequestName.Login, '', '');
    expect(getResolveNum(request, RequestName.Login)).toBe(2);
    request.unreply(RequestName.Login, f2);
    expect(getResolveNum(request, RequestName.Login)).toBe(1);
    request.unreply(RequestName.Login, f3);
    expect(getResolveNum(request, RequestName.Login)).toBe(0);
    await delay(200);
    expect(getResolveNum(request, RequestName.Login)).toBe(0);

    request.reply(RequestName.Login, f2);
    expect(getResolveNum(request, RequestName.Login)).toBe(1);
    request.reply(RequestName.Login, f2);
    expect(getResolveNum(request, RequestName.Login)).toBe(1);
    expect(console.warn).toBeCalledTimes(0);
    process.env.NODE_ENV = 'development';
    request.reply(RequestName.Login, f2);
    expect(getResolveNum(request, RequestName.Login)).toBe(1);
    expect(console.warn).toBeCalledTimes(1);
    expect(console.warn).nthCalledWith(
      1,
      '[request-reply] Invalid operation, there is a duplicate resolve in reply.'
    );
    request.unreply(RequestName.Login, f2);
    expect(getResolveNum(request, RequestName.Login)).toBe(0);
    expect(() => request.unreply(RequestName.Login, f3)).not.toThrowError();

    request.reply(RequestName.Login, f2);
    request.reply(RequestName.Login, f3);
    expect(getResolveNum(request, RequestName.Login)).toBe(2);
    request.unreply(RequestName.Login, f2);
    expect(getResolveNum(request, RequestName.Login)).toBe(1);

    request.unreply(RequestName.Login, (user: string, password: string) => {
      user;
      password;
      return true;
    });

    //@ts-expect-error
    expect(() => request.unreplyGroup()).toThrowError(
      '[request-reply] "undefined" is not a valid parameter.'
    );
  });

  it('should throw a error, when no response to the request', async () => {
    await expect(
      async () => await request.by(() => null)(RequestName.Count, 10)
    ).rejects.toThrow('[request-reply] No reply to the request named "count".');
  });

  it('request.one', async () => {
    request.reply(RequestName.Count, getResolve(10));
    expect(await request.one(RequestName.Count, 10)).toBe(100);
    expect(before).toBeCalledTimes(1);
    expect(before).toBeCalledWith(10);
    expect(after).toBeCalledTimes(1);
    expect(after).toBeCalledWith(100);
    before.mockClear();
    after.mockClear();

    request.reply(RequestName.Count, getResolve(20));
    await expect(async () => {
      await request.one(RequestName.Count, 10);
    }).rejects.toThrow(
      '[request-reply] The handler of request.one() only allows one reply.'
    );
    expect(before).not.toBeCalled();
    expect(after).not.toBeCalled();
  });

  it('request.many', async () => {
    request.reply(RequestName.Count, getResolve(10));
    request.reply(RequestName.Count, getResolve(20));
    request.reply(RequestName.Count, getResolve(30));
    expect(await request.many(3, RequestName.Count, 10)).toEqual([
      100,
      200,
      300,
    ]);
    expect(before).toBeCalledTimes(1);
    expect(before).toBeCalledWith(10);
    expect(after).toBeCalledTimes(1);
    expect(after).toBeCalledWith([100, 200, 300]);
    before.mockClear();
    after.mockClear();

    await expect(async () => {
      await request.many(2, RequestName.Count, 10);
    }).rejects.toThrow(
      '[request-reply] Different from the specified number of replies.'
    );
    expect(before).not.toBeCalled();
    expect(after).not.toBeCalled();
  });

  it('request.all', async () => {
    request.reply(RequestName.Count, getResolve(10));
    request.reply(RequestName.Count, getResolve(20));
    request.reply(RequestName.Count, getResolve(30));
    expect(await request.all(RequestName.Count, 10)).toEqual([100, 200, 300]);
    expect(before).toBeCalledTimes(1);
    expect(before).toBeCalledWith(10);
    expect(after).toBeCalledTimes(1);
    expect(after).toBeCalledWith([100, 200, 300]);
  });

  it('request.raceMany', async () => {
    request.reply(RequestName.Count, getResolve(10, 300));
    request.reply(RequestName.Count, getResolve(20, 200));
    request.reply(RequestName.Count, getResolve(30, 100));
    expect(await request.raceMany(3, RequestName.Count, 10)).toEqual([
      300,
      200,
      100,
    ]);
    expect(before).toBeCalledTimes(1);
    expect(before).toBeCalledWith(10);
    expect(after).toBeCalledTimes(1);
    expect(after).toBeCalledWith([300, 200, 100]);
    before.mockClear();
    after.mockClear();

    await expect(async () => {
      await request.raceMany(2, RequestName.Count, 10);
    }).rejects.toThrow(
      '[request-reply] Different from the specified number of replies.'
    );
    expect(before).not.toBeCalled();
    expect(after).not.toBeCalled();
  });

  it('request.raceAll', async () => {
    request.reply(RequestName.Count, getResolve(10, 300));
    request.reply(RequestName.Count, getResolve(20, 200));
    request.reply(RequestName.Count, getResolve(30, 100));
    expect(await request.raceAll(RequestName.Count, 10)).toEqual([
      300,
      200,
      100,
    ]);
    expect(before).toBeCalledTimes(1);
    expect(before).toBeCalledWith(10);
    expect(after).toBeCalledTimes(1);
    expect(after).toBeCalledWith([300, 200, 100]);
  });

  it('request.dispose', async () => {
    request.dispose();

    expect(request.before).toBeUndefined();
    expect(request.after).toBeUndefined();
    expect(() =>
      request.reply(RequestName.Count, getResolve(10))
    ).toThrowError();
    await expect(
      async () => await request.one(RequestName.Count, 10)
    ).rejects.toThrowError();
    await expect(
      async () => await request.many(3, RequestName.Count, 10)
    ).rejects.toThrowError();
    await expect(
      async () => await request.all(RequestName.Count, 10)
    ).rejects.toThrowError();
    await expect(
      async () => await request.raceMany(3, RequestName.Count, 10)
    ).rejects.toThrowError();
    await expect(
      async () => await request.raceAll(RequestName.Count, 10)
    ).rejects.toThrowError();
    expect(before).not.toBeCalled();
    expect(after).not.toBeCalled();
  });

  it('bind this', () => {
    request.reply(RequestName.Count, (value: number) => {
      return value;
    });
    expect(() => {
      request.one.call(undefined, RequestName.Count, 123);
    }).not.toThrowError();
  });

  describe('request.by', () => {
    it('{ concurrency: 3 }', async () => {
      const r1 = jest.fn(getResolve(10, 300));
      const r2 = jest.fn(getResolve(20, 200));
      const r3 = jest.fn(getResolve(30, 100));

      request.reply(RequestName.Count, r1);
      request.reply(RequestName.Count, r2);
      request.reply(RequestName.Count, r3);

      expect(await getCustomRequest(request, 3)(RequestName.Count, 10)).toEqual(
        [
          { index: 2, answer: 300 },
          { index: 1, answer: 200 },
          { index: 0, answer: 100 },
        ]
      );
      expect(before).toBeCalledTimes(1);
      expect(before).toBeCalledWith(10);
      expect(after).toBeCalledTimes(1);
      expect(after).toBeCalledWith([
        { index: 2, answer: 300 },
        { index: 1, answer: 200 },
        { index: 0, answer: 100 },
      ]);
    });
    it('{ concurrency: 1 }', async () => {
      const r1 = jest.fn(getResolve(10, 300));
      const r2 = jest.fn(getResolve(20, 200));
      const r3 = jest.fn(getResolve(30, 100));

      request.reply(RequestName.Count, r1);
      request.reply(RequestName.Count, r2);
      request.reply(RequestName.Count, r3);

      expect(await getCustomRequest(request, 1)(RequestName.Count, 10)).toEqual(
        [
          { index: 0, answer: 100 },
          { index: 1, answer: 200 },
          { index: 2, answer: 300 },
        ]
      );
      expect(before).toBeCalledTimes(1);
      expect(before).toBeCalledWith(10);
      expect(after).toBeCalledTimes(1);
      expect(after).toBeCalledWith([
        { index: 0, answer: 100 },
        { index: 1, answer: 200 },
        { index: 2, answer: 300 },
      ]);
    });
    it('{ concurrency: 1, catchError: true }', async () => {
      const r1 = jest.fn(getResolve(10, 300));
      const r2 = jest.fn(getResolve(20, 200, true));
      const r3 = jest.fn(getResolve(30, 100));

      request.reply(RequestName.Count, r1);
      request.reply(RequestName.Count, r2);
      request.reply(RequestName.Count, r3);

      expect(
        await getCustomRequest(request, 1, true)(RequestName.Count, 10)
      ).toEqual([
        { index: 0, answer: 100 },
        { index: 1, answer: new Error('Opps!') },
        { index: 2, answer: 300 },
      ]);
      expect(before).toBeCalledTimes(1);
      expect(before).toBeCalledWith(10);
      expect(after).toBeCalledTimes(1);
      expect(after).toBeCalledWith([
        { index: 0, answer: 100 },
        { index: 1, answer: new Error('Opps!') },
        { index: 2, answer: 300 },
      ]);
    });
    it('{ concurrency: 1, catchError: false }', async () => {
      const r1 = jest.fn(getResolve(10, 300));
      const r2 = jest.fn(getResolve(20, 200, true));
      const r3 = jest.fn(getResolve(30, 100));

      request.reply(RequestName.Count, r1);
      request.reply(RequestName.Count, r2);
      request.reply(RequestName.Count, r3);

      await expect(
        async () =>
          await getCustomRequest(request, 1, false)(RequestName.Count, 10)
      ).rejects.toThrow();

      expect(r1).toBeCalledTimes(1);
      expect(r2).toBeCalledTimes(1);
      expect(r3).not.toBeCalled();
      expect(before).toBeCalledTimes(1);
      expect(before).toBeCalledWith(10);
      expect(after).not.toBeCalled();
    });
  });

  describe('types', () => {
    it('only assign the TForm generic variable to the Request class', async () => {
      {
        const otherRequest = new Request<RequestForm>();
        otherRequest.reply(
          RequestName.Login,
          (user: string, password: string) => {
            user;
            password;
            return true;
          }
        );
        await otherRequest.one(RequestName.Login, '', '');
        //@ts-expect-error
        await otherRequest.one(RequestName.Login, 123);
        await otherRequest.many(1, RequestName.Login, '', '');
        //@ts-expect-error
        await otherRequest.many(1, RequestName.Login, 123);
        await otherRequest.raceMany(1, RequestName.Login, '', '');
        //@ts-expect-error
        await otherRequest.raceMany(1, RequestName.Login, 123);
        await otherRequest.all(RequestName.Login, '', '');
        //@ts-expect-error
        await otherRequest.all(RequestName.Login, 123);
        await otherRequest.raceAll(RequestName.Login, '', '');
        //@ts-expect-error
        await otherRequest.raceAll(RequestName.Login, 123);
        await otherRequest.by(() => null)(RequestName.Login, '', '');
        //@ts-expect-error
        await otherRequest.by(() => null)(RequestName.Login, 123);
        otherRequest.reply(
          RequestName.Login,
          //@ts-expect-error
          (user: string, password: string) => {
            user;
            password;
            return 123;
          }
        );
        //@ts-expect-error
        otherRequest.reply(RequestName.Login, (value: number) => {
          value;
          return true;
        });
        otherRequest.before.on(
          RequestName.Login,
          (user: string, password: string) => {
            user;
            password;
          }
        );
        //@ts-expect-error
        otherRequest.before.on(RequestName.Login, (value: number) => {
          value;
        });
        otherRequest.before.offAll(RequestName.Login);
        otherRequest.before.offAll((user: string, password: string) => {
          user;
          password;
        });
        otherRequest.after.on(RequestName.Login, (successed: boolean) => {
          successed;
        });
        //@ts-expect-error
        otherRequest.after.on(RequestName.Login, (successed: boolean[]) => {
          successed;
        });
        otherRequest.after.offAll(RequestName.Login);
        otherRequest.after.offAll((successed: boolean) => {
          successed;
        });
      }

      {
        const otherRequest = new Request<RequestForm>();
        //@ts-expect-error
        otherRequest.reply('other', (user: string, password: string) => {
          user;
          password;
          return true;
        });
        //@ts-expect-error
        await otherRequest.one('other', '', '');
        //@ts-expect-error
        await otherRequest.many(1, 'other', '', '');
        //@ts-expect-error
        await otherRequest.raceMany(1, 'other', '', '');
        //@ts-expect-error
        await otherRequest.all('other', '', '');
        //@ts-expect-error
        await otherRequest.raceAll('other', '', '');
        //@ts-expect-error
        await otherRequest.by(() => null)('other', '', '');
        //@ts-expect-error
        otherRequest.before.on('other', (value: number) => {
          value;
        });
        //@ts-expect-error
        otherRequest.before.offAll('other');
        //@ts-expect-error
        otherRequest.before.offAll((user: string, password: number) => {
          user;
          password;
        });
        //@ts-expect-error
        otherRequest.after.on('other', (response: number) => {
          response;
        });
        //@ts-expect-error
        otherRequest.after.offAll('other');
        //@ts-expect-error
        otherRequest.after.offAll((response: number[]) => {
          response;
        });
      }
    });

    it('assign the TForm & TForm2 generic variables to the Request class', async () => {
      type OtherForm = {
        fetch: (id: string, no: number) => { msg: string; data: any };
      };
      {
        const otherRequest = new Request<RequestForm, OtherForm>();
        otherRequest.reply(RequestName.Count, (value: number) => {
          return value;
        });
        await otherRequest.one(RequestName.Count, 123);
        //@ts-expect-error
        await otherRequest.one(RequestName.Count, '');
        await otherRequest.many(1, RequestName.Count, 123);
        //@ts-expect-error
        await otherRequest.many(1, RequestName.Count, '');
        await otherRequest.raceMany(1, RequestName.Count, 123);
        //@ts-expect-error
        await otherRequest.raceMany(1, RequestName.Count, '');
        await otherRequest.all(RequestName.Count, 123);
        //@ts-expect-error
        await otherRequest.all(RequestName.Count, '');
        await otherRequest.raceAll(RequestName.Count, 123);
        //@ts-expect-error
        await otherRequest.raceAll(RequestName.Count, '');
        await otherRequest.by(() => null)(RequestName.Count, 123);
        //@ts-expect-error
        await otherRequest.by(() => null)(RequestName.Count, '');
        //@ts-expect-error
        otherRequest.reply(RequestName.Count, (value: number) => {
          value;
          return '';
        });
        //@ts-expect-error
        otherRequest.reply(RequestName.Count, (value: string) => {
          value;
          return 123;
        });
        otherRequest.before.on(RequestName.Count, (value: number) => {
          value;
        });
        //@ts-expect-error
        otherRequest.before.on(RequestName.Count, (value: string) => {
          value;
        });
        otherRequest.before.offAll(RequestName.Count);
        otherRequest.before.offAll((value: number) => {
          value;
        });
        otherRequest.after.on(RequestName.Count, (response: number) => {
          response;
        });
        //@ts-expect-error
        otherRequest.after.on(RequestName.Count, (response: number[]) => {
          response;
        });
        otherRequest.after.offAll(RequestName.Count);
        otherRequest.after.offAll((successed: boolean) => {
          successed;
        });
      }

      {
        const otherRequest = new Request<RequestForm, OtherForm>();
        otherRequest.reply('fetch', (id: string, no: number) => {
          id;
          no;
          return { msg: '', data: {} };
        });
        await otherRequest.one('fetch', '', 1);
        //@ts-expect-error
        await otherRequest.one('fetch', 123);
        await otherRequest.many(1, 'fetch', '', 1);
        //@ts-expect-error
        await otherRequest.many(1, 'fetch', 123);
        await otherRequest.raceMany(1, 'fetch', '', 1);
        //@ts-expect-error
        await otherRequest.raceMany(1, 'fetch', 123);
        await otherRequest.all('fetch', '', 1);
        //@ts-expect-error
        await otherRequest.all('fetch', 123);
        await otherRequest.raceAll('fetch', '', 1);
        //@ts-expect-error
        await otherRequest.raceAll('fetch', 123);
        await otherRequest.by(() => null)('fetch', '', 1);
        //@ts-expect-error
        await otherRequest.by(() => null)('fetch', 123);
        //@ts-expect-error
        otherRequest.reply('fetch', (id: string, no: number) => {
          id;
          no;
          return 123;
        });
        //@ts-expect-error
        otherRequest.reply('fetch', (value: number) => {
          value;
          return { msg: '', data: {} };
        });
        otherRequest.before.on('fetch', (id: string, no: number) => {
          id;
          no;
        });
        //@ts-expect-error
        otherRequest.before.on('fetch', (user: string, password: string) => {
          user;
          password;
        });
        otherRequest.before.offAll('fetch');
        otherRequest.before.offAll((id: string, no: number) => {
          id;
          no;
        });
        otherRequest.after.on(
          'fetch',
          (response: { msg: string; data: any }[]) => {
            response;
          }
        );

        otherRequest.after.on(
          'fetch',
          //@ts-expect-error
          (response: { msg: string; data: any }) => {
            response;
          }
        );
        otherRequest.after.offAll('fetch');
        otherRequest.after.offAll((successed: boolean) => {
          successed;
        });
      }

      {
        const otherRequest = new Request<RequestForm, OtherForm>();
        //@ts-expect-error
        otherRequest.reply('other', (user: string, password: string) => {
          user;
          password;
          return true;
        });
        //@ts-expect-error
        await otherRequest.one('other', '', '');
        //@ts-expect-error
        await otherRequest.many(1, 'other', '', '');
        //@ts-expect-error
        await otherRequest.raceMany(1, 'other', '', '');
        //@ts-expect-error
        await otherRequest.all('other', '', '');
        //@ts-expect-error
        await otherRequest.raceAll('other', '', '');
        //@ts-expect-error
        await otherRequest.by(() => null)('other', '', '');
        //@ts-expect-error
        otherRequest.before.on('other', (value: number) => {
          value;
        });
        //@ts-expect-error
        otherRequest.before.offAll('other');
        //@ts-expect-error
        otherRequest.before.offAll((id: number, no: number) => {
          id;
          no;
        });
        //@ts-expect-error
        otherRequest.after.on('other', (response: number) => {
          response;
        });
        //@ts-expect-error
        otherRequest.after.offAll('other');
        //@ts-expect-error
        otherRequest.after.offAll((response: number[]) => {
          response;
        });
      }
    });

    it('when TForm, TForm2 has duplicate properties', async () => {
      type OtherForm = {
        fetch: (id: string, no: number) => { msg: string; data: any };
        api: (name: string) => boolean;
      };
      const otherRequest = new Request<OtherForm, OtherForm>();
      otherRequest.before.on('fetch', (id: string, no: number) => {
        id;
        no;
      });
      //@ts-expect-error
      otherRequest.before.on('fetch', (no: number) => {
        no;
      });
      otherRequest.after.on(
        'fetch',
        (
          response: { msg: string; data: any } | { msg: string; data: any }[]
        ) => {
          response;
        }
      );
      otherRequest.after.on(
        'fetch',
        //@ts-expect-error
        (response: { msg: string; data: any }) => {
          response;
        }
      );
      otherRequest.after.offAll(
        (
          response: { msg: string; data: any } | { msg: string; data: any }[]
        ) => {
          response;
        }
      );
      //@ts-expect-error
      otherRequest.after.offAll((response: { msg: string; data: any }[]) => {
        response;
      });

      type AnotherForm = {
        fetch: (id: string, no: number) => { msg: number };
        api: (name: string) => boolean;
      };
      const anotherRequest = new Request<OtherForm, AnotherForm>();
      anotherRequest.before.on('fetch', (id: string[]) => {
        id;
      });
      anotherRequest.before.on('api', (name: string) => {
        name;
      });
      //@ts-expect-error
      anotherRequest.before.on('api', (name: string[]) => {
        name;
      });
      anotherRequest.after.on(
        'fetch',
        (response: { a: number[]; b: string[] }) => {
          response;
        }
      );
      anotherRequest.after.on('api', (response: boolean | boolean[]) => {
        response;
      });
      anotherRequest.after.on(
        'api',
        //@ts-expect-error
        (response: { a: number[]; b: string[] }) => {
          response;
        }
      );
    });
  });
});
