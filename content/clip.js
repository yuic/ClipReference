//var log = loger('  C     ');

var Clip = function(){};
Clip.prototype = {
	init: function(initData, dtpAttrs){
		// 位置とか大きさとか割り当て
		this.allocBaseData(initData);

		// ローダーとフレームタイプの振り分け
		(initData.isScript === 1)
			? ( this.uiGenerType = 'UiGenerCmd', this.webLoader = new WebLoaderNothing() )
			: ( this.uiGenerType = 'UiGenerMin', this.webLoader = (initData.xpath ? new WebLoaderXml() : new WebLoaderIframe()) );

		// Clip生成
		this.dtpanel = $EL('panel', dtpAttrs.xulAttrs, [], dtpAttrs.xulStyles);
		Holder.getInstance(this.uiGenerType).buildUi(this);
		for(var e in dtpAttrs.listeners) this.dtpanel.addEventListener(e, dtpAttrs.listeners[e].bind(this) , false);

		return this;
	},

	// allocate metrics to this clip
	allocBaseData: function(metrics){ for(var k in metrics) this[ ClipManager.props[k] ] = metrics[k]; },

	// ポップアップを開く
	openPopup: function(e){
		// ポップアップ出現時のカーソル位置保存／最小化ポップアップを復元する時の位置計算用
		this.popEvtPosX = e.screenX;
		this.popEvtPosY = e.screenY;

		this.reloadPopup(e);

		// 開く
		var gener = Holder.getInstance(this.uiGenerType);
			gener.adjustSize(this);		// for when another browser window closes in background
		var {x, y} = gener.getPopupPosition(this);
		this.dtpanel.openPopupAtScreen(x, y, true);

		// 移動検知用変数更新 ／ 時間経過で閉じるときの判断用
		this.updateLastBound();
	},

	// reload web page on this popup when sync button is ON (also means pin button is on) or pin button is OFF
	reloadPopup: function(e){
		if( (this.sycBtn && this.sycBtn.getAttribute('checked'))
		|| !(this.pinBtn && this.pinBtn.getAttribute('checked')) ) this.webLoader.load(this);
	},

	// ポップアップを閉じる
	closePopup: function({ignoreGenType, source}){
		if( (source === this.id )									// clickされたポップアップ以外は閉じろ！
		 || (!ignoreGenType && this.uiGenerType === 'UiGenerDef')	// 復元されたやつは閉じない
		 || (this.pinBtn && this.pinBtn.checked)					// ピン留めされていれば無条件で閉じない(どうしても閉じるのは設定画面でOKされたとき)
		 || (this.dtpanel.getOuterScreenRect().width === 0)			// already closed
		) return;

		this.dtpanel.hidePopup();
		this.webLoader.clearBrowsPane(this);
		Holder.getInstance(this.uiGenerType).resize(this);
	},

	// このclipが移動されたかどうか ／ コマンド発火の前提条件として使ってね！
	isMoved: function(){
		var {left, top} = this.dtpanel.getBoundingClientRect();
		return ( this.lastBoundLeft !== left || this.lastBoundTop !== top );
	},

	// ポップアップをつかんで動かしたか検知する用
	updateLastBound: function(){
		var {left, top} = this.dtpanel.getBoundingClientRect();
		this.lastBoundLeft = left;
		this.lastBoundTop  = top;
	},

	// 最小化と通常サイズの切り替え
	restuff: function(newGenerType, width, height){
		// UI差し替え
		var newGener = Holder.getInstance( this.uiGenerType = newGenerType );
			newGener.buildUi(this);

		this.webLoader.load(this);

		// 位置とサイズ確定
		var {x, y} = newGener.getPopupPosition(this);
		this.dtpanel.moveTo(x, y);
		(width && height)
 			? this.dtpanel.sizeTo(width, height)
			: this.dtpanel.width = this.dtpanel.height = '';
	},
};
