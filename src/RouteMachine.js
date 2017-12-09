// possible states
const ENTERED = 'ENTERED'
const LEAVING = 'LEAVING'
const LEFT = 'LEFT'
const ENTERING = 'ENTERING'
const ERROR = 'ERROR'


// callback names
const BEFORE_ENTER = 'beforeEnterCallback'
const ENTER = 'enterCallback'
const LEAVE = 'leaveCallback'
const AFTER_LEAVE = 'afterLeaveCallback'


// create a new route callback function with optional
// enter-, leave-, beforeEnter- and afterLeaveCallbacks
// to give directly to page.js like
//
// page('/', routeFactory.makeRoute({
//   beforeEnter (ctx, lastCtx) {
//     ...
//   },
//   enter (ctx, lastCtx) {
//     ...
//   },
//   leave (ctx, nextCtx) {
//     ...
//   },
//   afterLeave (ctx, nextCtx) {
//     ...
//   },
// }))
//
// or enter callback only:
//
// page('/', routeFactory.makeRoute(ctx => {
//   ...
// }))
module.exports = class RouteMachine {

  constructor () {

    this.debug = false

    this.state = ENTERED

    // start with an empty route
    this.currentRoute = new Route()
    this.currentContext = null

    this.enqueuedRoute = null
    this.enqueuedContext = null

    this.afterEnqueuedRoute = null
    this.afterEnqueuedContext = null

    this.makeRoute = this.makeRoute.bind(this)
    this.wrapMakeRoute = this.wrapMakeRoute.bind(this)
  }

  // the main API function
  makeRoute (callbacks) {

    if (this.debug) console.log('RouteMachine#makeRoute')

    // the route class handles sanitising and
    // promisifying of all callbacks for us
    const route = new Route(callbacks)

    // this is the callback function for page.js.
    // it closes over the route and handles proper
    // enqueueing of the route when it is called.
    return context => {

      if (this.debug) console.log('RouteMachine: hit route!', context.pathname)

      // if there is currently no route enqueued,
      // we enqueue this one and call this.run,
      // as the routeMachine might be stopped. it
      // is theoretically safe to call this.run
      // as often as you want at any point in time,
      // as it will only cause a start if the
      // machine is currently halted and there is
      // indeed work to do.
      if (!this.enqueuedRoute) {

        this.enqueuedRoute = route
        this.enqueuedContext = context

        this.run()
      }

      // if there *is* already a route enqueued,
      // we want to enqueue this one after that,
      // because a running leaveCallback might already
      // have received the enqueuedContext as
      // the nextContext, and thus we want to make
      // sure that the enqueuedRoute will indeed
      // be run, so that leaveCallbacks can always
      // trust the nextContext they receive indeed
      // belongs to the next route that's going to
      // be entered.
      // (if another route is hit before
      // afterEnqueuedRoute is run, afterEnqueuedRoute
      // and afterEnqueuedContext will just be
      // replaced. which is ok, since they will not
      // have been passed to any function yet.)
      // also, we don't have to call this.run here,
      // because if there is still an enqueuedRoute,
      // that also means that the routeMachine is
      // already/still running.
      else {

        this.afterEnqueuedRoute = route
        this.afterEnqueuedContext = context
      }
    }
  }

  // create a new makeRoute function that in turn creates routes
  // that will always call the beforeEnterCallback supplied to wrapMakeRoute
  // before their individual enterCallbacks and always call afterLeaveCallback
  // after having called their individual leaveCallbacks.
  // this is useful if you have a lot of routes that have to do a lot of
  // the same stuff, but also have individual tasks.
  wrapMakeRoute (callbacks, _makeRoute) {

    if (this.debug) console.log('RouteMachine#wrapMakeRoute')

    const makeRoute = _makeRoute || this.makeRoute

    const wrapperRoute = new Route(callbacks)

    const wrapperBeforeEnter = wrapperRoute.callback.bind(null, BEFORE_ENTER)
    const wrapperEnter = wrapperRoute.callback.bind(null, ENTER)
    const wrapperLeave = wrapperRoute.callback.bind(null, LEAVE)
    const wrapperAfterLeave = wrapperRoute.callback.bind(null, AFTER_LEAVE)

    return callbacks => {

      const innerRoute = new Route(callbacks)

      const innerBeforeEnter = innerRoute.callback.bind(null, BEFORE_ENTER)
      const innerEnter = innerRoute.callback.bind(null, ENTER)
      const innerLeave = innerRoute.callback.bind(null, LEAVE)
      const innerAfterLeave = innerRoute.callback.bind(null, AFTER_LEAVE)

      return makeRoute({
        beforeEnter: composePromiseCallbacks(
          innerBeforeEnter, wrapperBeforeEnter),
        enter: composePromiseCallbacks(
          wrapperEnter, innerEnter),
        leave: composePromiseCallbacks(
          innerLeave, wrapperLeave),
        afterLeave: composePromiseCallbacks(
          wrapperAfterLeave, innerAfterLeave),
      })
    }
  }

  // also TODO make sure errors are handled from all Promises
  // or at least not swallowed silently, which is one of the
  // biggest problems with the current routeFactory implementation
  // when debugging routes!

  // TODO Idea:
  // create a nicer API in terms of wrapMakeRoute that
  // inverts control and works like a middleware mechanism
  // with a use-Method or something

  // NO PUBLIC APIS BELOW THIS POINT

  run () {

    if (this.debug) console.log('RouteMachine#run - state:', this.state)

    if (this.state === ENTERED) {
      this.onENTERED()
    }

    else if (this.state === LEFT) {
      this.onLEFT()
    }

    // There are no branches for ENTERING or LEAVING,
    // because I think it makes no sense to do anything else
    // while we are currently entering or leaving a route.
    // So in these cases, we just wait for the enterCallback/
    // leaveCallback to complete. They will call this.run()
    // when they're done anyway, and then enter whatever
    // route will have been enqueued by then.
  }

  onENTERED () {

    if (this.debug) console.log('RouteMachine#onENTERED')

    // this will be called either when an enterCallback
    // has been run successfully or when a we have been
    // in ENTERED state for a while and a new route has
    // been hit. In the first case, there is not
    // necessarily a next route enqueued right away,
    // so we'll have to check for that.
    if (this.enqueuedRoute) {

      if (this.debug) console.log('RouteMachine: leaving')

      this.state = LEAVING

      // as stated before, a callback will never be interrupted,
      // so we can safely wait for it to complete and then go on
      // with whatever comes next.
      // NOTE that the enqueuedContext (or nextContext) given
      // to the leaveCallback is not necessarily that of the
      // actual next enterCallback, in case a new route will
      // be enqueued in the meantime!
      const leave = composePromiseCallbacks(
        this.currentRoute.callback.bind(null, LEAVE),
        this.currentRoute.callback.bind(null, AFTER_LEAVE))

      Promise.all([
        this.enqueuedRoute.callback(BEFORE_ENTER,
                                    this.enqueuedContext,
                                    this.currentContext),
        leave(this.currentContext, this.enqueuedContext),
      ])
        .then(() => {

          if (this.debug) console.log('RouteMachine: left')

          this.state = LEFT
          this.run()

        }, error => {

          this.state = ERROR
          if (this.debug) console.log(error)
        })
    }
  }

  onLEFT () {

    // we cannot get into LEFT state without a new route
    // being enqueued, so we don't have to check for that
    // here.

    if (this.debug) console.log('RouteMachine#onLEFT')

    this.state = ENTERING

    if (this.debug) console.log('RouteMachine: entering')
    if (this.debug) console.log('this.enqueuedRoute', this.enqueuedRoute)

    const enter = this.enqueuedRoute.callback.bind(null, ENTER)

    const lastContext = this.currentContext

    // we are now on the formerly-enqueued route!
    this.currentRoute = this.enqueuedRoute
    this.currentContext = this.enqueuedContext

    if (this.afterEnqueuedRoute) {
      this.enqueuedRoute = this.afterEnqueuedRoute
      this.enqueuedContext = this.afterEnqueuedContext
      this.afterEnqueuedRoute = null
      this.afterEnqueuedContext = null
    } else {
      this.enqueuedRoute = null
      this.enqueuedContext = null
    }

    if (this.debug) console.log('going to call the composed callbacks')
    if (this.debug) console.log('enter', enter)

    enter(this.currentContext, lastContext)
      .then(() => {

        if (this.debug) console.log('RouteMachine: entered')

        // we now managed to successfully enter the route!
        this.state = ENTERED

        // in case there is another route enqueued already,
        // this will leave the currentRoute immediately
        // and enter the then-enqueued route subsequently
        this.run()

      }, error => {

        this.state = ERROR
        console.log(error)
      })
  }
}


class Route {

  constructor (callbacks) {

    this.sanitiseCallbacks(callbacks)

    this.callback = this.callback.bind(this)
  }

  callback(name, context1, context2) {

    return asPromise(this[name], context1, context2)
  }

  sanitiseCallbacks (callbacks={}) {

    const isSingleCallback =
          Object.prototype.toString.call(callbacks) === '[object Function]'

    this[BEFORE_ENTER] =
          (!isSingleCallback && callbacks.beforeEnter) || noop

    this[ENTER] =
          (isSingleCallback && callbacks) || callbacks.enter || noop

    this[LEAVE] =
          (isSingleCallback && noop) || callbacks.leave || noop

    this[AFTER_LEAVE] =
          (!isSingleCallback && callbacks.afterLeave) || noop
  }
}

module.exports.Route = Route


// call a function that may or may not return a promise
// and return a promise. if the function doesn't return
// a promise then it must be synchronous or all hell breaks
// loose (at the call site, presumably)
function asPromise (fn, ...args) {

  const maybePromise = fn(...args)

  if (isPromise(maybePromise)) {

    return maybePromise
  }

  return Promise.resolve()
}

module.exports.asPromise = asPromise


function isFunction (maybeFunction) {

  return Object.prototype.toString.call(maybeFunction) === '[object Function]'
}

module.exports.isFunction = isFunction


function isPromise (maybePromise) {

  return !!maybePromise &&
    (Object.prototype.toString.call(maybePromise) === '[object Object]' ||
     isFunction(maybePromise)) &&
    isFunction(maybePromise.then)
}

module.exports.isPromise = isPromise


function composePromiseCallbacks (first, second) {
  return (...args) =>
    first(...args)
      .then(() => second(...args))
}

module.exports.composePromiseCallbacks = composePromiseCallbacks


function noop () {}
