//@ts-check

import { build } from 'rollup-simple-configer'
import pkg from './package.json'

const input = './src/index.ts'

export default [].concat(
  build(
    input,
    {
      file: pkg.main,
      format: 'cjs',
    },
    { external: ['pichu', 'p-map'] }
  ),
  build(
    input,
    {
      file: pkg.module,
      format: 'esm',
    },
    { external: ['pichu', 'p-map'] }
  ),
  build(
    input,
    {
      file: 'dist/umd/request-reply.umd.js',
      format: 'umd',
      name: 'requestReply',
      globals: {
        ['aggregate-error']: 'AggregateError',
      },
    },
    { withMin: true, resolveOnly: ['pichu', 'p-map'] }
  )
)