import test from 'ava'

import Q from 'q'

import { isPromise } from '../dist/RouteMachine'

test('recognise native ES6 Promises', t => {

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

test('recognise third-party promises', t => {

  t.plan(1)

  const p1 = Q(true)
  t.true(isPromise(p1))
})

test('recognise random thenables', t => {

  t.plan(2)

  const t1 = {
    then () {
      return false
    },
  }
  t.true(isPromise(t1))

  function t2 () { return 1 + 1 }
  t2.then = t2
  t.true(isPromise(t2))
})

test('reject other stuff', t => {

  t.plan(9)

  t.false(isPromise(1))
  t.false(isPromise(false))
  t.false(isPromise(NaN))
  t.false(isPromise(null))
  t.false(isPromise(void 0))
  t.false(isPromise(global))
  t.false(isPromise([5, 7, 'qq']))
  t.false(isPromise({ hey: 87 }))
  t.false(isPromise(() => 0))
})
