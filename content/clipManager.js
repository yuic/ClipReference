//var log = loger(' B      ');

var ClipManager = {
	clipPool: [],

	// DBカラムとドキュメント要素IDの紐つけ用 ／ clipが使う
	props: {width       : 'lastWidth'   , height      : 'lastHeight'  ,
			posX_def    : 'lastPosX_def', posY_def    : 'lastPosY_def',
			posX_min    : 'lastPosX_min', posY_min    : 'lastPosY_min',
			defaultPin  : 'defaultPin'  , defaultSync : 'defaultSync' ,
			defaultZoom : 'defaultZoom' , id          : 'id'},

	init: function(aUnique){
		window.setTimeout(this.loadAppData.bind(this), 500);

		// borrow the appContent for marker as release a instance from scopes when the browser window unloaded
		$('appcontent').appendChild( $EL('box', {hidden: true, id: 'CLRF_unique', value: aUnique}) );
	},

	// close & open Clips with close timer
	reOpen: function(e){
		// 検索対象文字列を確定
		ClipManager.selectedChars = ClipManager.getSelectedChars();

		if( this.trigger.preventOpen(e) ) return;
		this.notifyOpen(e);
		this.setCloseSequence(this.menuToClose);
	},

	// return the string that is selected on browser
	getSelectedChars: function(){
		var cd = document.commandDispatcher;
		var focused = cd.focusedElement;
		return ( cd.focusedWindow.getSelection().toString()
			|| (this.enableTxtField && focused && focused.value && focused.value.substring(focused.selectionStart, focused.selectionEnd)) );
	},

	// helper for process to each clip
	eachClip: function(func, arg){ for(var i=0, iLim=this.clipPool.length; i<iLim; func(i, arg), i++); },

	// notify open to clips
	notifyOpen:  function(e){ this.eachClip( function(i, ev){ this.clipPool[i].openPopup(ev) }.bind(this), e ); },

	// notify close to clips
	notifyClose: function(ignore){
		this.abortCloseSequence();
		this.eachClip( function(i, ignore){ this.clipPool[i].closePopup(ignore) }.bind(this), ignore );
	},

	// notify reload to clips
	notifyReload:  function(e){ this.eachClip( function(i, ev){ this.clipPool[i].reloadPopup(ev) }.bind(this), e ); },

	// set timer for close clips
	setCloseSequence: function(toClose){
		this.closeTimer = window.setTimeout( function(){ this.notifyClose({ignoreGenType:false}); }.bind(this), toClose );
	},

	// calcel close timer
	abortCloseSequence: function(){ window.clearTimeout(this.closeTimer); },

	// notify from clip
	notify: function(e, data){
		switch(e.type){
			case 'mouseenter': this.abortCloseSequence();								break;
			case 'mouseleave': this.setCloseSequence(this.menuToClose);					break;
			case 'command'   : this.notifyClose({ignoreGenType:true, source: data});	break;	// close all clips except with clip that event fired
			case 'click'     : this.notifyClose({ignoreGenType:true, source: data});	break;
			case 'prefclose' : this.dispose(), this.loadAppData();						break;
			case 'hotkey'    : this.trigger.listeners[e.type](e);						break;
		}
	},

	// 指定IDを持つclipの尺度情報をDBに反映する / 他のclipは無視
	saveAppData: function(id){
		for(var i=0, iLim=this.clipPool.length; i<iLim; i++){
			var clip = this.clipPool[i];
			if(clip.id !== id) continue;

			DB.init();
			DB.updateMetrics( [clip.id, clip.lastWidth, clip.lastHeight,
				clip.lastPosX_def, clip.lastPosY_def, clip.lastPosX_min, clip.lastPosY_min]);
			break;
		};
	},

	// 最新の尺度情報(DB値)をclipに反映する(前回までのものは削除)
	loadAppData: function(){
		// load common preferences (except in delayed load keys)
		DB.init();
		var prefs = DB.getPrefs();
		PrefsKeys.forEach( function(e){
			( e[2] ) ? this[ e[0] ] = (prefs[ e[1] ] === e[2])
					 : this[ e[0] ] =  prefs[ e[1] ]
		}, this );

		// clipがなかったら作る。あったら尺度だけ更新
		(this.clipPool.length === 0) ? this.createClips() : this.refreshClips();

		// prepare popup triggers
		this.trigger = TriggerSwitcher[this.openTrigger];
		this.trigger.keySetup();

		delete this.openTrigger;
		delete this.triggerKey;

		for(var e in this.trigger.listeners) $('appcontent').addEventListener( e, this.trigger.listeners[e]);
	},

	// Clip作る人
	createClips: function(){
		// who notifies fired events on clip to ClipManager / shared between events
		var notifier = function(e){
			this.updateLastBound();
			ClipManager.notify(e);
		};

		// clipにくっつける通知イベント / clipが使う
		//  閉じるタイマーと表示位置記録用
		var dtpAttrs = {
			xulAttrs  : { id: 'CLRF_dtpanel', flex:1, noautofocus: true, noautohide: true },
			xulStyles : { border: 'solid ButtonShadow 1px', borderRadius: '3px' },
			listeners : { mouseleave: notifier, mouseenter: notifier, mousedown: notifier }
		};

		// initiate and pooling Clip objects by values from DB
		var flgm = document.createDocumentFragment();
		DB.getBaseData().forEach(function(e, i){ flgm.appendChild( (this.clipPool[i] = new Clip().init(e, dtpAttrs)).dtpanel ); }, this);
		$('mainPopupSet').appendChild(flgm);
	},

	// Clipの尺度更新
	refreshClips: function(){
		var basedata = DB.getBaseData();
		this.eachClip( function(i, metrics){ this.clipPool[i].allocBaseData( metrics[i] ); }.bind(this), basedata );
	},

	// clipの破棄と、リスナの解放、ショートカットキーの無効化
	dispose: function(){
		var mainPops = $('mainPopupSet');
		var children = mainPops.childNodes;
		for(var i=children.length-1; i>=0; i--) if(children[i].id === 'CLRF_dtpanel') mainPops.removeChild(children[i]);
		this.clipPool.length = 0;
		for(var e in this.trigger.listeners) $('appcontent').removeEventListener(e, this.trigger.listeners[e]);
		TriggerSwitcher.removeKeyset();
	},

	// 配下の全インスタンス開放
	shutdown: function(){
		DB.destroy();
		this.abortCloseSequence();
		this.dispose();
		this.clipPool = null;
	},

};

// ポップアップ方式を分割する人
// 要素名が数字のやつがポップアップ方式の実装
var TriggerSwitcher = {
	reOpen : function(e){ ClipManager.reOpen(e); },
	notify : function(e){ ClipManager.notify(e); },
	notifyClose : function(e){ ClipManager.notifyClose({ignoreGenType: true}); },

	// return object that has event fired points of x and y
	setScreenXY : function(e){ return {screenX: e.screenX, screenY: e.screenY}; },
	removeKeyset : function(){
		var lastkeyset = $('clipreference_keyset');
		if(lastkeyset) lastkeyset.parentNode.removeChild(lastkeyset);
	},

	// create key element
	keySetup: function(){
		TriggerSwitcher.removeKeyset();

		// DBからとってきたやつを要素生成用にばらす: 'ctrl + shift + alt + A' -> [ctrl, shift, alt, A]
		var modifiers = ClipManager.triggerKey.split(' + ');
		var key = modifiers.pop();
		if(modifiers[0] === 'ctrl') modifiers[0] = 'control';

		var keyAttrs = {id: 'clipreference_key', modifiers: modifiers, oncommand: 'void(0);'};
		$extend( keyAttrs, (key.length > 1 ? {keycode: 'VK_' + key} : {key: key}) );
		var keyEl = $EL('key', keyAttrs);

		keyEl.addEventListener('command', function(e){
			var event = window.document.createEvent('CustomEvent');
			event.initCustomEvent('hotkey', true, true, null);
			$('CLRF_unique').dispatchEvent(event);
		}, false);
		$('mainKeyset').parentNode.appendChild( $EL('keyset', {id: 'clipreference_keyset'}, [keyEl]) );
	},
};

// functionの生成数を減らす。参照エラー回避のためにTriggerSwitcherを生成してから中身を入れる
$extend(TriggerSwitcher, {
	// type-immediate.  popup when select the string.
	0: {
		// set up the hot key
		keySetup: dummyN,

		// appcontentにくっつけるイベントリスナ
		listeners: {
			'prefclose': TriggerSwitcher.notify,
			'dblclick' : TriggerSwitcher.reOpen,
			'mouseup'  : TriggerSwitcher.reOpen,
			'mousedown': function(e){
				TriggerSwitcher.notifyClose();
				ClipManager.entryPoint = {screenX: e.screenX, screenY: e.screenY};
			},
		},

		// conditions to prevent popup
		//  1. no characters are selected
		//  2. not main mouse button
		//  3. mouseup event without drag (for when anchor tag clicked)
		preventOpen: function(e){
			return( ( !ClipManager.selectedChars )
				||  ( e.button !== 0 )
				||  ( e.type === 'mouseup' && e.screenX === ClipManager.entryPoint.screenX
						&& e.screenY === ClipManager.entryPoint.screenY )
			);
		},
	},

	// type-hotkey.  popup when press the hotkey after characters selected.
	1: {
		keySetup: TriggerSwitcher.keySetup,
		listeners: {
			'prefclose': TriggerSwitcher.notify,
			'hotkey'   : function(e){ ClipManager.reOpen( $extend(e, ClipManager.endPoint) ); },
			'mousedown': TriggerSwitcher.notifyClose,
			'mouseup'  : function(e){
				ClipManager.endPoint = TriggerSwitcher.setScreenXY(e);
				if(ClipManager.selectedChars = ClipManager.getSelectedChars()) ClipManager.notifyReload(e);
			},
		},
		//  1. no characters are selected
		preventOpen: function(e){ return( !ClipManager.selectedChars ); },
	},

	// type-hold.  popup when select the string while hold down the hotkey.
	2: {
		keySetup: TriggerSwitcher.keySetup,
		listeners: {
 			'prefclose': TriggerSwitcher.notify,
			'dblclick' : TriggerSwitcher.reOpen,
			'hotkey'   : function(e){ ClipManager.keypressflg = true; },
			'mousedown': function(e){
				TriggerSwitcher.notifyClose();
				ClipManager.entryPoint = TriggerSwitcher.setScreenXY(e);
				ClipManager.keypressflg = false;
			},
			'mouseup'  : function(e){
				ClipManager.endPoint = TriggerSwitcher.setScreenXY(e);
				if(ClipManager.selectedChars = ClipManager.getSelectedChars()) ClipManager.notifyReload(e);
				ClipManager.reOpen(e);
			},
		},
		//  1. no characters are selected
		//  2. not main mouse button
		//  3. mouseup event without drag (for when anchor tag clicked)
		//  4. hotkey is not hold down
		preventOpen: function(e){
			return( ( !ClipManager.selectedChars )
				||  ( e.button !== 0 )
				||  ( e.type === 'mouseup' && e.screenX === ClipManager.entryPoint.screenX
						&& e.screenY === ClipManager.entryPoint.screenY )
				||  ( !ClipManager.keypressflg )
			);
		},
	},
});
