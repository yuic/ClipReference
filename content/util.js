var { classes: Cc, interfaces: Ci, utils: Cu } = Components;
Cu.import('resource://gre/modules/Services.jsm', this);
/** /
var loger = function(source){ return function(msg){
	dump( new Date().toString().substring(16,24) + ' |' + source + '| ' + msg + '\n' );
} };
/**/
var $ = function(id){ return window.document.getElementById(id); };
var $EL = function(tag, attr, children, style){ return $ATTRS(window.document.createElement(tag), attr, children, style); };
var $ELNS = function(ns, tag, attr, children, style){ return $ATTRS(window.document.createElementNS(ns, tag), attr, children, style); };
var $ATTRS = function(el, attr, children, style){
	if(attr) for(let a in attr) el.setAttribute(a, attr[a]);
	if(children) for( let i=0, iLim=children.length; i<iLim; el.appendChild(children[i]), i++ );
	if(style) for(let a in style) el.style[a] = style[a];
	return el;
};
var $isCommittable = function(winAccepted){
	return ( Services.prefs.getBoolPref('browser.preferences.instantApply') || winAccepted );
};
var $searchHref = function(elm){
	if(!elm) return null;
	if(elm.tagName === 'A' || elm.tagName === 'a') return elm.href;
	return $searchHref(elm.parentNode);
};
var $extend = function(instantiatedBase, append){
	for(var p in append) instantiatedBase[p] = append[p];
	return instantiatedBase;
};

// common preference keys (except in delayed load keys)
var PrefsKeys = [
	// element id      ,  column name      ,  boolean <-> int (for explicit conversion)
	['enableTxtField'  , 'enableTxtField'  , '1'],
	['alwaysMinimum'   , 'alwaysMinimum'   , '1'],
	['displayLabel'    , 'displayLabel'    , '1'],
	['minMoveFree'     , 'minMoveFree'     , '1'],
	['menuToClose'     , 'menuToClose'          ],
	['openTrigger'     , 'openTrigger'          ],
	['triggerKey'      , 'triggerKey'           ],
	['toolDir'         , 'toolDir'              ],
];

// append delayed load keys into PrefsKeys
var PrefsKeysAll = PrefsKeys.concat([
	['openTabActivate0', 'openTabActivate0', '1'],
	['behavior0'       , 'behavior0'            ],
	['openTabActivate1', 'openTabActivate1', '1'],
	['behavior1'       , 'behavior1'            ],
	['openTabActivate2', 'openTabActivate2', '1'],
	['behavior2'       , 'behavior2'            ],
	['openTabActivateB', 'openTabActivateB', '1'],
	['behaviorB'       , 'behaviorB'            ],
]);

function $evaluateXPath(aNode, aExpr) {
	var xpe = Cc["@mozilla.org/dom/xpath-evaluator;1"].createInstance(Ci.nsIDOMXPathEvaluator);
	var nsResolver = xpe.createNSResolver(
		(aNode.ownerDocument === null) ? aNode.documentElement : aNode.ownerDocument.documentElement
	);
	var result = xpe.evaluate(aExpr, aNode, nsResolver, 0, null);
	var found = [];
	var res;
	while (res = result.iterateNext()) found.push(res);
	return found;
};
var dummyF = function(){return false;};
var dummyN = function(){};
