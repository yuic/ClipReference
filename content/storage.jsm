EXPORTED_SYMBOLS = ['DB', '$LOCALE'];

var { interfaces: Ci, utils: Cu } = Components;
Cu.import('resource://gre/modules/Services.jsm');

//var log = function(msg) { dump( new Date().toString().substring(16,24) + ' |     S  | ' + msg + '\n' ) };

var DB = {
	file: null,
	conn: null,

	// attach .sqlite file or create it and tables
	init: function(){
		if(DB.file) return;

		DB.file = Services.dirsvc.get('ProfD', Ci.nsIFile);
		DB.file.append('clipreference.sqlite');

		var tableCount = DB.getItemsMap(
			DB.getConnection().createStatement("SELECT count(*) FROM sqlite_master WHERE type='table' AND name='pref';")
		)[0]['count(*)'];

		if( tableCount === 0) DB.createTables();
	},

	// close connection
	destroy: function(){
		if(( DB.conn && DB.conn.connectionReady )) DB.conn.close();
		DB.file = DB.conn = null;
	},

	// open connection. error when try to get connection without initialize.
	getConnection: function(){
		return ( DB.conn && DB.conn.connectionReady )
			? DB.conn
			: DB.conn = Services.storage.openDatabase(DB.file);
	},

	// create tables from property files that defaultSql.properties and clipreference.properties
	createTables: function(){
		var conn = DB.getConnection();
		var sqlBundle = Services.strings.createBundle('chrome://clipreference/content/defaultSql.properties');

		// DROP & CREATE
		var DDL_KEYS = ['sql.drop.table.command', 'sql.create.table.command', 'sql.drop.table.pref', 'sql.create.table.pref'];
		for(var i=0, iLim=DDL_KEYS.length; i<iLim; i++) conn.executeSimpleSQL( sqlBundle.GetStringFromName(DDL_KEYS[i]) );

		// INSERT
		var sqlEnum = sqlBundle.getSimpleEnumeration();
		while( sqlEnum.hasMoreElements() ){
			let sqlProp = sqlEnum.getNext().QueryInterface(Ci.nsIPropertyElement);
			if( DDL_KEYS.indexOf(sqlProp.key) > -1 ) continue;	// exclude DDL_KEYS

			// localize. Varies depending on the definition of replacers
			let sql;
			try{
				let localizedArray = $LOCALE(sqlProp.key).split('__DELM__');
				sql = sqlBundle.formatStringFromName(sqlProp.key, localizedArray, localizedArray.length);
			}catch(e){
				sql = sqlBundle.GetStringFromName( sqlProp.key );
			}
			conn.executeSimpleSQL(sql);
		}

		DB.conn.asyncClose();
	},

	// helper at set values to update sql
	bindPrms: function( statement, idx, param ){
		switch( typeof param ){
			case 'string' : statement.bindUTF8StringParameter(idx, param); break;
			case 'number' : statement.bindInt32Parameter(idx, param);      break;
			default       : statement.bindNullParameter(idx);              break;
		}
	},

	// helper at extract return values from statement
	getValByType: function(statement, idx){
		switch( statement.getTypeOfIndex(idx) ){
			case statement.VALUE_TYPE_TEXT    : return statement.getUTF8String(idx); break;
			case statement.VALUE_TYPE_INTEGER : return statement.getInt32(idx);      break;
			case statement.VALUE_TYPE_NULL    : return null;                         break;
		}
	},

	// execute query and return a array of KV maps. [ {id, name, ...}, {id, name, ...} ]
	getItemsMap: function(statement){
		var resultMaps = [];
		var recordIndex = 0;
		while( statement.executeStep() ){
			var aRecordMap = {};
			for(var j=0, colCt=statement.columnCount; j<colCt; j++) aRecordMap[statement.getColumnName(j)] = DB.getValByType(statement, j);
			resultMaps[recordIndex++] = aRecordMap;
		}
		statement.finalize();
		return resultMaps;
	},

	// execute query and return a KV map. {k, v}
	getPrefMap: function(statement){
		var resultArrays = {};
		while( statement.executeStep() ){
			for(var j=0, colCt=statement.columnCount; j<colCt; j+=2)
				resultArrays[DB.getValByType(statement, j)] = DB.getValByType(statement, j+1);
		}
		statement.finalize();
		return resultArrays;
	},

	// execute query for each items
	bindAndExecute: function(statement, items){
		items.forEach( function(row, ridx){
			row.forEach( function(col, cidx){ DB.bindPrms(statement, cidx, col); } );
			statement.execute();
			statement.reset();
		} );
		statement.finalize();
	},

	// helper for select an item
	getRecordById: function(sqlString, id){
		var statement = DB.getConnection().createStatement(sqlString);
			statement.bindUTF8StringParameter(0, id);
		return DB.getItemsMap(statement)[0];
	},

	// for label and image
	getLabelDataById: function(id){ return DB.getRecordById("SELECT name, favicon FROM command WHERE id=?1;", id); },

	// for default state
	getDefaultById: function(id){ return DB.getRecordById("SELECT defaultPin, defaultSync, defaultZoom FROM command WHERE id=?1;", id); },

	// for web access
	getWebQueryStringsById: function(id){ return DB.getRecordById("SELECT url_script, xpath FROM command WHERE id=?1;", id); },

	// for initialize popups
	getBaseData: function(){
		return DB.getItemsMap(DB.getConnection().createStatement(
			"SELECT id, isScript, xpath, width, height, posX_def, posY_def, posX_min, posY_min FROM command ORDER BY id;"
		));
	},

	// for displays on the preference page
	getDetailData: function(){
		return DB.getItemsMap(DB.getConnection().createStatement(
			"SELECT id, name, isScript, url_script, xpath, width, height, posX_def, posY_def, posX_min, posY_min, defaultPin, defaultSync, defaultZoom, favicon FROM command;"
		));
	},

	// update sizes and positions.
	updateMetrics: function(metrics){
		var statement = DB.getConnection().createStatement(
			"UPDATE command SET width=?2, height=?3, posX_def=?4, posY_def=?5, posX_min=?6, posY_min=?7 WHERE id=?1;");
		DB.bindAndExecute(statement, [metrics]);
	},

	// update all clip data. once delete command table and re-insert.
	// id, name, isScript, url_script, xpath, width, height, posx_def, posy_def, posx_min, posy_min, favicon
	updateClipData: function(clips){
		DB.getConnection().executeSimpleSQL("DELETE FROM command;");
		var statement = DB.getConnection().createStatement(
			"INSERT INTO command VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15);");
		DB.bindAndExecute(statement, clips);
	},

	////////  for prefs /////////////
	// get all preferences
	getPrefs: function(){
		var statement = DB.getConnection().createStatement("SELECT key, value FROM pref;");
		var prefs = DB.getPrefMap(statement);
		return prefs;
	},

	// get specified preferences (delay is allowed for now)
	getPrefByKeys: function(keys){
		var sql ="SELECT key, value FROM pref WHERE key IN (";
		for(let i=1, iLim=keys.length+1; i<iLim; i++) sql += "?" + i + ",";
		sql = sql.slice(0, sql.length-1) + ");";

		var statement = DB.getConnection().createStatement(sql);
		for(let i=0, iLim=keys.length; i<iLim; i++) statement.bindUTF8StringParameter(i, keys[i]);

		var prefs = DB.getPrefMap(statement);
		return prefs;
	},

	// update specified preferences
	updatePrefs: function(items){
		var statement = DB.getConnection().createStatement("UPDATE pref SET value=?2 WHERE key=?1;");
		DB.bindAndExecute(statement, items);
	},

};

var LocaleBundle = {
	b:null,
	getBundle: function(){
		return ( this.b || (this.b = Services.strings.createBundle('chrome://clipreference/locale/clipreference.properties')) );
	},
};
var $LOCALE = function(key){ return (function(key){ return LocaleBundle.getBundle().GetStringFromName(key); }); }();
