import { Request } from '../src';

export enum RequestName {
  Count = 'count',
  Login = 'login',
}
export type RequestForm = {
  [RequestName.Count]: (value: number) => number;
  [RequestName.Login]: (user: string, password: string) => boolean;
};

export function delay(t: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, t);
  });
}

export function getResolve(multiple: number, time?: number, error = false) {
  return async (num: number) => {
    if (time !== undefined) await delay(time);
    if (error) throw new Error('Opps!');
    return num * multiple;
  };
}

export function getCustomRequest(
  request: Request,
  concurrency = Infinity,
  stopOnError = true
) {
  return async (name: string, ...args: any[]) => {
    return await request.by(
      (accumulator: any, answer: any, index: number) => {
        accumulator.push(index);
        return accumulator;
      },
      { concurrency, stopOnError }
    )(name, ...args);
  };
}
