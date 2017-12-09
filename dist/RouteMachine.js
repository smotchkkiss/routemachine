'use strict';

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

// possible states
var ENTERED = 'ENTERED';
var LEAVING = 'LEAVING';
var LEFT = 'LEFT';
var ENTERING = 'ENTERING';
var ERROR = 'ERROR';

// callback names
var BEFORE_ENTER = 'beforeEnterCallback';
var ENTER = 'enterCallback';
var LEAVE = 'leaveCallback';
var AFTER_LEAVE = 'afterLeaveCallback';

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
module.exports = function () {
  function RouteMachine() {
    _classCallCheck(this, RouteMachine);

    this.debug = false;

    this.state = ENTERED;

    // start with an empty route
    this.currentRoute = new Route();
    this.currentContext = null;

    this.enqueuedRoute = null;
    this.enqueuedContext = null;

    this.afterEnqueuedRoute = null;
    this.afterEnqueuedContext = null;

    this.makeRoute = this.makeRoute.bind(this);
    this.wrapMakeRoute = this.wrapMakeRoute.bind(this);
  }

  // the main API function


  _createClass(RouteMachine, [{
    key: 'makeRoute',
    value: function makeRoute(callbacks) {
      var _this = this;

      if (this.debug) console.log('RouteMachine#makeRoute');

      // the route class handles sanitising and
      // promisifying of all callbacks for us
      var route = new Route(callbacks);

      // this is the callback function for page.js.
      // it closes over the route and handles proper
      // enqueueing of the route when it is called.
      return function (context) {

        if (_this.debug) console.log('RouteMachine: hit route!', context.pathname);

        // if there is currently no route enqueued,
        // we enqueue this one and call this.run,
        // as the routeMachine might be stopped. it
        // is theoretically safe to call this.run
        // as often as you want at any point in time,
        // as it will only cause a start if the
        // machine is currently halted and there is
        // indeed work to do.
        if (!_this.enqueuedRoute) {

          _this.enqueuedRoute = route;
          _this.enqueuedContext = context;

          _this.run();
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

            _this.afterEnqueuedRoute = route;
            _this.afterEnqueuedContext = context;
          }
      };
    }

    // create a new makeRoute function that in turn creates routes
    // that will always call the beforeEnterCallback supplied to wrapMakeRoute
    // before their individual enterCallbacks and always call afterLeaveCallback
    // after having called their individual leaveCallbacks.
    // this is useful if you have a lot of routes that have to do a lot of
    // the same stuff, but also have individual tasks.

  }, {
    key: 'wrapMakeRoute',
    value: function wrapMakeRoute(callbacks, _makeRoute) {

      if (this.debug) console.log('RouteMachine#wrapMakeRoute');

      var makeRoute = _makeRoute || this.makeRoute;

      var wrapperRoute = new Route(callbacks);

      var wrapperBeforeEnter = wrapperRoute.callback.bind(null, BEFORE_ENTER);
      var wrapperEnter = wrapperRoute.callback.bind(null, ENTER);
      var wrapperLeave = wrapperRoute.callback.bind(null, LEAVE);
      var wrapperAfterLeave = wrapperRoute.callback.bind(null, AFTER_LEAVE);

      return function (callbacks) {

        var innerRoute = new Route(callbacks);

        var innerBeforeEnter = innerRoute.callback.bind(null, BEFORE_ENTER);
        var innerEnter = innerRoute.callback.bind(null, ENTER);
        var innerLeave = innerRoute.callback.bind(null, LEAVE);
        var innerAfterLeave = innerRoute.callback.bind(null, AFTER_LEAVE);

        return makeRoute({
          beforeEnter: composePromiseCallbacks(innerBeforeEnter, wrapperBeforeEnter),
          enter: composePromiseCallbacks(wrapperEnter, innerEnter),
          leave: composePromiseCallbacks(innerLeave, wrapperLeave),
          afterLeave: composePromiseCallbacks(wrapperAfterLeave, innerAfterLeave)
        });
      };
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

  }, {
    key: 'run',
    value: function run() {

      if (this.debug) console.log('RouteMachine#run - state:', this.state);

      if (this.state === ENTERED) {
        this.onENTERED();
      } else if (this.state === LEFT) {
        this.onLEFT();
      }

      // There are no branches for ENTERING or LEAVING,
      // because I think it makes no sense to do anything else
      // while we are currently entering or leaving a route.
      // So in these cases, we just wait for the enterCallback/
      // leaveCallback to complete. They will call this.run()
      // when they're done anyway, and then enter whatever
      // route will have been enqueued by then.
    }
  }, {
    key: 'onENTERED',
    value: function onENTERED() {
      var _this2 = this;

      if (this.debug) console.log('RouteMachine#onENTERED');

      // this will be called either when an enterCallback
      // has been run successfully or when a we have been
      // in ENTERED state for a while and a new route has
      // been hit. In the first case, there is not
      // necessarily a next route enqueued right away,
      // so we'll have to check for that.
      if (this.enqueuedRoute) {

        if (this.debug) console.log('RouteMachine: leaving');

        this.state = LEAVING;

        // as stated before, a callback will never be interrupted,
        // so we can safely wait for it to complete and then go on
        // with whatever comes next.
        // NOTE that the enqueuedContext (or nextContext) given
        // to the leaveCallback is not necessarily that of the
        // actual next enterCallback, in case a new route will
        // be enqueued in the meantime!
        var leave = composePromiseCallbacks(this.currentRoute.callback.bind(null, LEAVE), this.currentRoute.callback.bind(null, AFTER_LEAVE));

        Promise.all([this.enqueuedRoute.callback(BEFORE_ENTER, this.enqueuedContext, this.currentContext), leave(this.currentContext, this.enqueuedContext)]).then(function () {

          if (_this2.debug) console.log('RouteMachine: left');

          _this2.state = LEFT;
          _this2.run();
        }, function (error) {

          _this2.state = ERROR;
          if (_this2.debug) console.log(error);
        });
      }
    }
  }, {
    key: 'onLEFT',
    value: function onLEFT() {
      var _this3 = this;

      // we cannot get into LEFT state without a new route
      // being enqueued, so we don't have to check for that
      // here.

      if (this.debug) console.log('RouteMachine#onLEFT');

      this.state = ENTERING;

      if (this.debug) console.log('RouteMachine: entering');
      if (this.debug) console.log('this.enqueuedRoute', this.enqueuedRoute);

      var enter = this.enqueuedRoute.callback.bind(null, ENTER);

      var lastContext = this.currentContext;

      // we are now on the formerly-enqueued route!
      this.currentRoute = this.enqueuedRoute;
      this.currentContext = this.enqueuedContext;

      if (this.afterEnqueuedRoute) {
        this.enqueuedRoute = this.afterEnqueuedRoute;
        this.enqueuedContext = this.afterEnqueuedContext;
        this.afterEnqueuedRoute = null;
        this.afterEnqueuedContext = null;
      } else {
        this.enqueuedRoute = null;
        this.enqueuedContext = null;
      }

      if (this.debug) console.log('going to call the composed callbacks');
      if (this.debug) console.log('enter', enter);

      enter(this.currentContext, lastContext).then(function () {

        if (_this3.debug) console.log('RouteMachine: entered');

        // we now managed to successfully enter the route!
        _this3.state = ENTERED;

        // in case there is another route enqueued already,
        // this will leave the currentRoute immediately
        // and enter the then-enqueued route subsequently
        _this3.run();
      }, function (error) {

        _this3.state = ERROR;
        console.log(error);
      });
    }
  }]);

  return RouteMachine;
}();

var Route = function () {
  function Route(callbacks) {
    _classCallCheck(this, Route);

    this.sanitiseCallbacks(callbacks);

    this.callback = this.callback.bind(this);
  }

  _createClass(Route, [{
    key: 'callback',
    value: function callback(name, context1, context2) {

      return asPromise(this[name], context1, context2);
    }
  }, {
    key: 'sanitiseCallbacks',
    value: function sanitiseCallbacks() {
      var callbacks = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};


      var isSingleCallback = Object.prototype.toString.call(callbacks) === '[object Function]';

      this[BEFORE_ENTER] = !isSingleCallback && callbacks.beforeEnter || noop;

      this[ENTER] = isSingleCallback && callbacks || callbacks.enter || noop;

      this[LEAVE] = isSingleCallback && noop || callbacks.leave || noop;

      this[AFTER_LEAVE] = !isSingleCallback && callbacks.afterLeave || noop;
    }
  }]);

  return Route;
}();

// call a function that may or may not return a promise
// and return a promise. if the function doesn't return
// a promise then it must be synchronous or all hell breaks
// loose (at the call site, presumably)


function asPromise(fn) {
  for (var _len = arguments.length, args = Array(_len > 1 ? _len - 1 : 0), _key = 1; _key < _len; _key++) {
    args[_key - 1] = arguments[_key];
  }

  var maybePromise = fn.apply(undefined, args);

  if (isPromise(maybePromise)) {

    return maybePromise;
  }

  return Promise.resolve();
}

function isFunction(maybeFunction) {

  return Object.prototype.toString.call(maybeFunction) === '[object Function]';
}

function isPromise(maybePromise) {

  return !!maybePromise && (Object.prototype.toString.call(maybePromise) === '[object Object]' || isFunction(maybePromise)) && isFunction(maybePromise.then);
}

function composePromiseCallbacks(first, second) {
  return function () {
    for (var _len2 = arguments.length, args = Array(_len2), _key2 = 0; _key2 < _len2; _key2++) {
      args[_key2] = arguments[_key2];
    }

    return first.apply(undefined, args).then(function () {
      return second.apply(undefined, args);
    });
  };
}

function noop() {}