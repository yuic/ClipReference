//var log = loger(' B      ');

var ClipManager = {
	clipPool: [],

	// DBカラムとドキュメント要素IDの紐つけ用 ／ clipが使う
	props: {width       : 'lastWidth'   , height      : 'lastHeight'  ,
			posX_def    : 'lastPosX_def', posY_def    : 'lastPosY_def',
			posX_min    : 'lastPosX_min', posY_min    : 'lastPosY_min',
			defaultPin  : 'defaultPin'  , defaultSync : 'defaultSync' ,
			defaultZoom : 'defaultZoom' , id          : 'id'},

	// appcontentにくっつけるイベントリスナ ／ ClipManagerが使う
	listeners: {
		'mousedown': function ex_CLRF_mousedown(e){ ClipManager.draggingEntryX = e.screenX; ClipManager.draggingEntryY = e.screenY; },
		'mouseup'  : function ex_CLRF_mouseup(e)  { ClipManager.reOpen(e); },
		'dblclick' : function ex_CLRF_dblclick(e) { ClipManager.reOpen(e); }
	},

	init: function(aUnique){
		this.draggingEntryX = this.draggingEntryY = 0;	// initialize var for detect Clip is dragged
		for(var e in this.listeners) $('appcontent').addEventListener(e, this.listeners[e] , false);

		// borrow the appContent for marker as release a instance from scopes when the browser window unloaded
		$('appcontent').appendChild( $EL('box', {hidden: true, id: 'CLRF_unique', value: aUnique}) );
	},

	// close & open Clips with close timer
	reOpen: function(e){
		// load common preferences & clip data
		if(this.clipPool.length === 0){
			DB.init();
			this.loadAppData();
		}
		this.notifyClose({ignoreGenType:true});

		// 検索対象文字列を確定
		var cd = document.commandDispatcher;
		var focused = cd.focusedElement;
		this.selectedChars = ( cd.focusedWindow.getSelection().toString()
			|| (this.enableTxtField && focused && focused.value && focused.value.substring(focused.selectionStart, focused.selectionEnd)) );

		if( this.preventOpen(e) ) return;
		this.notifyOpen(e);
		this.setCloseSequence(this.menuToClose);
	},

	// conditions of prevent for open popup
	//  1. no characters are selected (characters in text area is optional)
	//  2. not main clicked
	//  3. mouseup event without drag (for when anchor tag clicked)
	preventOpen: function(e){
		return( ( !this.selectedChars )
			||  ( e.button !== 0 )
			||  ( e.type === 'mouseup' && e.screenX === this.draggingEntryX && e.screenY === this.draggingEntryY )
		);
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
		var prefs = DB.getPrefs();
		PrefsKeys.forEach( function(e){
			( e[2] ) ? this[ e[0] ] = (prefs[ e[1] ] === e[2])
					 : this[ e[0] ] =  prefs[ e[1] ]
		}, this );

		// clipがなかったら作る。あったら尺度だけ更新
		(this.clipPool.length === 0) ? this.createClips() : this.refreshClips();
	},

	// Clip作る人
	createClips: function(){
		// who notifies fired events on clip to ClipManager / shared between events
		var notifier = function(e){
			this.updateLastBound();
			ClipManager.notify(e);
		};

		// clipにくっつける通知イベント / clipが使う
		//  mouse系は閉じるタイマーと表示位置記録用、prefCloseは設定画面を確定した時用
		var dtpAttrs = {
			xulAttrs  : { id: 'CLRF_dtpanel', flex:1, noautofocus: true, noautohide: true },
			xulStyles : { border: 'solid ButtonShadow 1px', borderRadius: '3px' },
			listeners : { mouseleave: notifier, mouseenter: notifier, mousedown: notifier, prefclose: notifier }
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

	// 既存のclipの破棄と、scopesからの削除
	dispose: function(){
		var mainPops = $('mainPopupSet');
		var children = mainPops.childNodes;
		for(var i=children.length-1; i>=0; i--) if(children[i].id === 'CLRF_dtpanel') mainPops.removeChild(children[i]);
		this.clipPool.length = 0;
	},

	// 配下の全インスタンス開放
	shutdown: function(){
		DB.destroy();
		this.abortCloseSequence();
		this.dispose();
		for(var e in this.listeners) $('appcontent').removeEventListener(e, this.listeners[e]);
		this.clipPool = null;
	},

};
