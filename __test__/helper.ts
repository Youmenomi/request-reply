import { Hydreigon } from 'hydreigon';
import { Form, Request } from '../src';

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

export function getCustomRequest<TForm extends Form<TForm> = Form<any>>(
  request: Request<TForm>,
  concurrency = Infinity,
  catchError = false
) {
  return async (name: keyof TForm, ...args: Parameters<TForm[keyof TForm]>) => {
    return await request.by(
      (accumulator: any, answer: any, index: number) => {
        accumulator.push({ answer, index });
        return accumulator;
      },
      { concurrency, catchError }
    )(name, ...args);
  };
}

export function getResolveNum<TForm extends Form<TForm> = Form<any>>(
  request: Request<TForm>,
  name: string
) {
  return ((request as any)._indexer as Hydreigon).searchSize('event', name);
}
