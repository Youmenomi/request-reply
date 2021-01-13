import { Request } from '../src';
import {
  RequestForm,
  RequestName,
  getResolve,
  getCustomRequest,
} from './helper';

describe('request-reply', () => {
  let request: Request<RequestForm>;
  let before: jest.Mock<number, [number]>;
  let after: jest.Mock<number, [number]>;

  beforeEach(() => {
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

  it('should throw a error, when no response to the request', async () => {
    await expect(
      async () => await request.by(() => null)(RequestName.Count, 10)
    ).rejects.toThrow('[request-reply] No reply to the request named count.');
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

      expect(
        await getCustomRequest(request, 3)(RequestName.Count, 10)
      ).toEqual([2, 1, 0]);
      expect(before).toBeCalledTimes(1);
      expect(before).toBeCalledWith(10);
      expect(after).toBeCalledTimes(1);
      expect(after).toBeCalledWith([2, 1, 0]);
    });
    it('{ concurrency: 1 }', async () => {
      const r1 = jest.fn(getResolve(10, 300));
      const r2 = jest.fn(getResolve(20, 200));
      const r3 = jest.fn(getResolve(30, 100));

      request.reply(RequestName.Count, r1);
      request.reply(RequestName.Count, r2);
      request.reply(RequestName.Count, r3);

      expect(
        await getCustomRequest(request, 1)(RequestName.Count, 10)
      ).toEqual([0, 1, 2]);
      expect(before).toBeCalledTimes(1);
      expect(before).toBeCalledWith(10);
      expect(after).toBeCalledTimes(1);
      expect(after).toBeCalledWith([0, 1, 2]);
    });
    it('{ concurrency: 1, stopOnError: true }', async () => {
      const r1 = jest.fn(getResolve(10, 300));
      const r2 = jest.fn(getResolve(20, 200, true));
      const r3 = jest.fn(getResolve(30, 100));

      request.reply(RequestName.Count, r1);
      request.reply(RequestName.Count, r2);
      request.reply(RequestName.Count, r3);

      await expect(
        async () =>
          await getCustomRequest(request, 1, true)(RequestName.Count, 10)
      ).rejects.toThrow();

      expect(r1).toBeCalledTimes(1);
      expect(r2).toBeCalledTimes(1);
      expect(r3).not.toBeCalled();
      expect(before).toBeCalledTimes(1);
      expect(before).toBeCalledWith(10);
      expect(after).not.toBeCalled();
    });
    it('{ concurrency: 1, stopOnError: false }', async () => {
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
      expect(r3).toBeCalledTimes(1);
      expect(before).toBeCalledTimes(1);
      expect(before).toBeCalledWith(10);
      expect(after).not.toBeCalled();
    });
  });

  describe('types', () => {
    it('only assign the TForm generic variable to the Request class', async () => {
      const otherRequest = new Request<RequestForm>();
      otherRequest.one(RequestName.Login, '', '');
      //@ts-expect-error
      otherRequest.one(RequestName.Login, 123);
      otherRequest.many(1, RequestName.Login, '', '');
      //@ts-expect-error
      otherRequest.many(1, RequestName.Login, 123);
      otherRequest.raceMany(1, RequestName.Login, '', '');
      //@ts-expect-error
      otherRequest.raceMany(1, RequestName.Login, 123);
      otherRequest.all(RequestName.Login, '', '');
      //@ts-expect-error
      otherRequest.all(RequestName.Login, 123);
      otherRequest.raceAll(RequestName.Login, '', '');
      //@ts-expect-error
      otherRequest.raceAll(RequestName.Login, 123);
      otherRequest.by(() => null)(RequestName.Login, '', '');
      //@ts-expect-error
      otherRequest.by(() => null)(RequestName.Login, 123);
      otherRequest.reply(
        RequestName.Login,
        (user: string, password: string) => {
          user;
          password;
          return true;
        }
      );
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

      //@ts-expect-error
      otherRequest.one('other', '', '');
      //@ts-expect-error
      otherRequest.many(1, 'other', '', '');
      //@ts-expect-error
      otherRequest.raceMany(1, 'other', '', '');
      //@ts-expect-error
      otherRequest.all('other', '', '');
      //@ts-expect-error
      otherRequest.raceAll('other', '', '');
      //@ts-expect-error
      otherRequest.by(() => null)('other', '', '');
      //@ts-expect-error
      otherRequest.reply('other', (user: string, password: string) => {
        user;
        password;
        return true;
      });
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
    });

    it('assign the TForm & TForm2 generic variables to the Request class', async () => {
      type OtherForm = {
        fetch: (id: string, no: number) => { msg: string; data: any };
      };
      const otherRequest = new Request<RequestForm, OtherForm>();
      otherRequest.one(RequestName.Count, 123);
      //@ts-expect-error
      otherRequest.one(RequestName.Count, '');
      otherRequest.many(1, RequestName.Count, 123);
      //@ts-expect-error
      otherRequest.many(1, RequestName.Count, '');
      otherRequest.raceMany(1, RequestName.Count, 123);
      //@ts-expect-error
      otherRequest.raceMany(1, RequestName.Count, '');
      otherRequest.all(RequestName.Count, 123);
      //@ts-expect-error
      otherRequest.all(RequestName.Count, '');
      otherRequest.raceAll(RequestName.Count, 123);
      //@ts-expect-error
      otherRequest.raceAll(RequestName.Count, '');
      otherRequest.by(() => null)(RequestName.Count, 123);
      //@ts-expect-error
      otherRequest.by(() => null)(RequestName.Count, '');
      otherRequest.reply(RequestName.Count, (value: number) => {
        return value;
      });
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

      otherRequest.one('fetch', '', 1);
      //@ts-expect-error
      otherRequest.one('fetch', 123);
      otherRequest.many(1, 'fetch', '', 1);
      //@ts-expect-error
      otherRequest.many(1, 'fetch', 123);
      otherRequest.raceMany(1, 'fetch', '', 1);
      //@ts-expect-error
      otherRequest.raceMany(1, 'fetch', 123);
      otherRequest.all('fetch', '', 1);
      //@ts-expect-error
      otherRequest.all('fetch', 123);
      otherRequest.raceAll('fetch', '', 1);
      //@ts-expect-error
      otherRequest.raceAll('fetch', 123);
      otherRequest.by(() => null)('fetch', '', 1);
      //@ts-expect-error
      otherRequest.by(() => null)('fetch', 123);
      otherRequest.reply('fetch', (id: string, no: number) => {
        id;
        no;
        return { msg: '', data: {} };
      });
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

      //@ts-expect-error
      otherRequest.one('other', '', '');
      //@ts-expect-error
      otherRequest.many(1, 'other', '', '');
      //@ts-expect-error
      otherRequest.raceMany(1, 'other', '', '');
      //@ts-expect-error
      otherRequest.all('other', '', '');
      //@ts-expect-error
      otherRequest.raceAll('other', '', '');
      //@ts-expect-error
      otherRequest.by(() => null)('other', '', '');
      //@ts-expect-error
      otherRequest.reply('other', (user: string, password: string) => {
        user;
        password;
        return true;
      });
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
