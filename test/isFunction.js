import test from 'ava'

import { isFunction } from '../dist/RouteMachine'

test('recognise built-in functions', t => {

  t.plan(4)

  t.true(isFunction(encodeURIComponent))
  t.true(isFunction(JSON.parse))
  t.true(isFunction(console.log))
  t.true(isFunction(Math.cos))
})

test('recognise user function expressions', t => {

  t.plan(3)

  t.true(isFunction(function () {}))
  t.true(isFunction(function doStuff() {}))
  t.true(isFunction(() => {}))
})

test('recognise named user functions', t => {

  t.plan(3)

  function f1 () {}
  const f2 = function () {}
  const f3 = () => {}

  t.true(isFunction(f1))
  t.true(isFunction(f2))
  t.true(isFunction(f3))
})

test('recognise user methods', t => {

  t.plan(4)

  class Tester {

    woop () {}

    static whop () {}
  }

  t.true(isFunction(Tester.whop))
  const nt = new Tester()
  t.true(isFunction((new Tester()).woop))

  const o = {
    f1: function woot () {},
    f2 () {},
  }

  t.true(isFunction(o.f1))
  t.true(isFunction(o.f2))
})

test('reject other stuff', t => {

  t.plan(9)

  t.false(isFunction(1))
  t.false(isFunction(false))
  t.false(isFunction(NaN))
  t.false(isFunction(null))
  t.false(isFunction(void 0))
  t.false(isFunction(global))
  t.false(isFunction([5, 7, 'qq']))
  t.false(isFunction({ hey: 87 }))
  t.false(isFunction(new Promise(() => {})))
})
