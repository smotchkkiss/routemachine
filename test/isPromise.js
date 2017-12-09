import test from 'ava'

import { isPromise } from '../dist/RouteMachine'

test('recognises native ES6 Promises', t => {

  t.plan(4)

  const p1 = new Promise(() => {})
  t.true(isPromise(p1))

  const p2 = Promise.resolve()
  t.true(isPromise(p2))

  const p3 = Promise.reject().catch(() => {})
  t.true(isPromise(p3))

  const p4 = p1.then(() => {})
  t.true(isPromise(p4))
})
