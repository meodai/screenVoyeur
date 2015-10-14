'use strict';

var $, ScreenVoyeur,
    // helper functions
    measureViewPort, measureDom, detectCollision, sortWaypoints, scrollPos,

    // constants
    nameSpace, debuggerAttributes;

/*eslint no-undef:0 */
$ = require('jquery');

nameSpace = 'ScreenVoyeur';

debuggerAttributes = {
  class: nameSpace + '-debug',
  css: {
    'z-index': 1000,
    position: 'absolute',
    top: 0, height: 0,
    width: '100%',
    background: 'rgba(222,0,0,.15)',
    outline: '1px solid red',
    'pointer-events': 'none'
  }
};

scrollPos = function (context, direction){
  direction = direction || 'y';
  if( direction === 'x' ) {
    return context.scrollX || context.pageXOffset;
  } else {
    return context.scrollY || context.pageYOffset;
  }
};

measureViewPort = function(context, offset){
  return {
    top: scrollPos(context) + offset.top,
    bottom: scrollPos(context) + context.innerHeight - offset.bottom,
    height: context.innerHeight - offset.top - offset.bottom
  };
};

measureDom = function(el, scrollTop, offset){
  var boundingBoxRect = el.getBoundingClientRect();
  scrollTop = scrollTop || 0;
  return {
    top: boundingBoxRect.top + scrollTop - offset.top,
    bottom: boundingBoxRect.bottom + scrollTop + offset.bottom
  };
};

detectCollision = function(aStart, aStop, bStart, bStop) {
  return aStart < bStop && aStop > bStart;
};

sortWaypoints = function(waypoinsArray){
  if (waypoinsArray.length <= 1) {
      return waypoinsArray;
    } else {
      var waypoints = waypoinsArray.slice(0);
      waypoints.sort(function (a, b) {
        return a.position.top > b.position.top ? 1 : -1;
      });
      return waypoints;
    }
};

ScreenVoyeur = function(options){
  this.options = {
    debug           : false,
    context         : window,
    scrollEvent     : 'scroll',
    triggerOffset   : {top: 0, bottom: 0},
    triggerType     : 'viewport', //, 'directional', 'adaptive'
    forceActive     : false
  };

  this.options                  = $.extend(this.options, options, {});

  this.context                  = this.options.context;
  this.$context                 = $(this.context);
  this.$contextBody             = this.context === window ? $(document.body) : this.$context;

  this.offset                   = this.options.triggerOffset;
  this.trigger                  = measureViewPort(this.context, this.offset);
  this.scrollDirection          = 'down';
  this.lastVisibleWaypointIndex = 0;

  // contains the elements that will trigger on scroll
  this.waypoints                = [];
  this.waypointsActive          = [];
  this.waypointsInactive        = [];

  // callbacks
  this.callbacks                = { enter: [], leave: [] };

  if ( this.options.debug ) {
    this.$debug = $('<div />', debuggerAttributes);
    this.$debug.css({
      top: this.trigger.top,
      height: this.trigger.height
    });
    this.$contextBody.append( this.$debug );
  }

  this.start();
};

ScreenVoyeur.prototype = {
  _onScroll: function(){
    var self = this;
    if( !this.isTicking ) {
      requestAnimationFrame(function(){
        self._update();
      });
      self.isTicking = true;
    }
  },
  _update: function(){
    if(this.options.debug){
      var debug = this.$debug[0];
      debug.style.top = this.trigger.top + 'px';
      debug.style.height = this.trigger.height + 'px';
    }

    this.updateVisibility();

    // do some mesurement here and update the elements that are visible
    this.isTicking = false;
  },
  _updateTrigger: function(){
    var newTrigger = measureViewPort(this.context, this.offset);
    this.scrollDirection = newTrigger.top > this.trigger.top ? 'down' : 'up';
    this.trigger = newTrigger;
  },
  _resize: function(){
    this._updateTrigger();
    this._onScroll();
  },
  start: function(){
    var self = this;
    this.$context
    .on(this.options.scrollEvent + '.' + nameSpace,
      function(){
        self._updateTrigger();
        self._onScroll();
      }
    );
    $(window).on('resize', function(){
      self._resize();
    });
  },
  stop: function(){},
  addWaypoint: function($els, offset){
    var waypoint;
    var self = this;
    offset = offset || {top: 0, bottom: 0};

    $els.each(function(){
      waypoint = {
        element: this,
        $element: $(this),
        position: measureDom(this, scrollPos(self.context), offset),
        visible: false,
        offset: offset
      };

      self.waypoints.push(waypoint);
    });

    self.waypoints = sortWaypoints(self.waypoints);
  },
  updateWaypointPositions: function(){
    var self = this;
    self.waypoints.forEach(function(waypoint){
      waypoint.position = measureDom(waypoint.element, scrollPos(self.context), waypoint.offset);
    });
    self.updateVisibility();
  },
  _updateWaypointStatus: function(waypoint, event, index) {
    var callCallback, isVisible;
    callCallback = function(fn){
      fn.call(waypoint.element, waypoint.element);
    };
    isVisible = (event === 'enter');
    this.callbacks[event].forEach(callCallback);
    this.waypoints[index].visible = isVisible;
  },
  _updateWaypointVisibility: function(waypoint, i){
    var isColliding;

    isColliding = detectCollision(
      waypoint.position.top,
      waypoint.position.bottom,
      this.trigger.top,
      this.trigger.bottom
    );

    if (isColliding && !waypoint.visible) {
      this._updateWaypointStatus(waypoint, 'enter', i);
    } else if ( !isColliding && waypoint.visible ) {
      this._updateWaypointStatus(waypoint, 'leave', i);
    }

    if (isColliding) {
      this.waypointsActive.push(waypoint);
      this.lastVisibleWaypointIndex = i;
    } else {
      this.waypointsInactive.push(waypoint);
    }
  },
  updateVisibility: function(){
    this.waypointsActive = []; this.waypointsInactive = [];
    this.waypoints.forEach(this._updateWaypointVisibility, this);

    if ( this.options.forceActive && this.waypointsActive.length < 1 ) {
      var i = this.lastVisibleWaypointIndex;

      if( i < this.waypoints.length - 1 && i > 0 ) {
        if(this.scrollDirection === 'down') {
          i++;
        } else {
          i--;
        }
      }
      this._updateWaypointStatus(this.waypoints[i], 'enter', i);
    }
  },
  on: function(event, fn){
    this.callbacks[event].push(fn);
  },
  off: function(event, fn){
    var self = this;
    self.callbacks[event].some(function(callback, i) {
      if(callback === fn){
        self.callbacks[event].splice(i, 1);
        return true;
      }
    });
  }
};

module.exports = ScreenVoyeur;
