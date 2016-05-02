/**
 * @ngdoc module
 * @name ngSQLite
 * @description
 *
 * # ngSQLite
 *
 * Angular SQLite
 * Project: https://github.com/reduardo7/angular-sqlite
 * Copyright (c) 2016 Angular SQLite Browser | Eduardo Daniel Cuomo | eduardo.cuomo.ar@gmail.com
 *
 * By: Edueado Daniel Cuomo.
 *
 * The `ngSQLite` module provides routing and deeplinking services and directives for angular apps.
 *
 * <div doc-module-components="ngSQLite"></div>
 */
/*jslint browser: true, regexp: true, white: true, evil: true */
/*global openDatabase */
angular.module('ngSQLite', []).factory('$SQLite', ['$q', function ($q) {
	var _db,
		_db_initialited = false,
		_db_init_count = 0,
		_initDeferred = $q.defer(),
		_initFns = [];

	function prepareVar(v, toStr, clon) {
		if (v instanceof Date) {
			v = v.toISOString();
		} else if (v === true) {
			v = 1;
		} else if (v === false) {
			v = 0;
		}
		if (toStr) {
			if (v === undefined) {
				v = '';
			} else if (v === null) {
				return 'NULL';
			} else {
				v = v.toString().replace(/'/g, "\\'");
			}
			if (clon) {
				v = "'" + v + "'";
			}
		}
		return v;
	}

	function prepareParams(params) {
		if (!params || (params.length === 0)) {
			return params;
		}
		var p2 = [], i;
		for (i = 0; i < params.length; i++) {
			p2.push(prepareVar(params[i]));
		}
		return p2;
	}

	function insert_replace(action, table, data) {
		var deferred = $q.defer();

		_db.transaction(function (tx) {
			var $this = this,
				i, j, sql, d, v, c,
				datas = (data instanceof [].constructor) ? data : [data];

			for (j = 0; j < datas.length; j++) {
				// Prepare
				data = datas[j];
				sql = action + ' INTO ' + table + ' (';
				d = [];
				v = '';
				c = '';

				// Build
				for (i in data) {
					if (data.hasOwnProperty(i)) {
						if (c) {
							c += ',';
							v += ',';
						}
						c += i;
						v += '?';
						d.push(prepareVar(data[i]));
					}
				}

				sql += c + ') VALUES (' + v + ')';

				console.log('$SQLite', 'insert_replace', sql, d);

				// Execute
				tx.executeSql(sql, d,
					function (tx, results) { deferred.resolve(results.insertId, results.rowsAffected); },
					function (tx, error) { console.error(error); deferred.reject(error); }
				);
			}
		});

		return deferred.promise;
	}

	return {
		dbConfig: function (dbCfg) {
			console.log('$SQLite', 'dbConfig', arguments);

			if (!dbCfg) dbCfg = {};

			if (!dbCfg.name) dbCfg.name = 'SQLiteDB';
			if (!dbCfg.description) dbCfg.description = dbCfg.name;
			if (!dbCfg.size) dbCfg.size = '-1';
			if (!dbCfg.version) dbCfg.version = '1.0';

			_db = openDatabase(dbCfg.name, dbCfg.version, dbCfg.description, ((dbCfg.size || 10) * 1024 * 1024))
		},

		/**
		 * Create table.
		 *
		 * @param {String} table Table name.
		 * @param {Object} definition Table definition.
		 *        {
		 *              id : { type: 'INTEGER', primary : true, autoincrement: true, unique: true } // Equals to -> id : { type: 'KEY' } || id : 'key'
		 *            , name : { type: 'TEXT', null: false }
		 *            , price : { type: 'REAL' | 'DECIMAL' | 'FLOAT', default: 0 }
		 *            , age : { type: 'INTEGER' | 'INT' }
		 *            , description : { type: 'BLOB' | 'LONGTEXT', null: true }
		 *            , ref1_id : { type: 'INTEGER', foreign: { table: 'tableX', key: 'id' } }
		 *            , ref2_id : { type: 'INTEGER', foreign: 'tableX.id' }
		 *        }
		 *        Operations:
		 *          {Boolean} __dropTable (Default: FALSE) Drop table if exists?
		 * @param {Array[Object]} initData (Default: NONE) Rows to add if table not exists.
		 */
		createTable: function (table, definition, initData) {
			// CREATE TABLE IF NOT EXISTS orders (id INTEGER PRIMARY KEY AUTOINCREMENT, customerId INTEGER, price INT)
			// CREATE TABLE IF NOT EXISTS clientes (id INTEGER PRIMARY KEY AUTOINCREMENT, nombre TEXT, edad TEXT)
			var $this = this;
			var deferred = $q.defer();

			_db.transaction(function () {
				// Build
				var d, t, tableEmpty,
					sql = 'CREATE TABLE IF NOT EXISTS ' + table + ' (',
					f = true;

				$this.tableExists(table)
					.then(function (result) {
						tableEmpty = result && result.rows && (result.rows.length > 0);

						angular.forEach(definition, function (d, c) {
							if (c !== '__dropTable') {
								if (f) {
									f = false;
								} else {
									sql += ',';
								}
								sql += ' ' + c;

								if (typeof d === 'string') {
									t = d.toUpperCase();
									d = { };
								} else if (d) {
									t = (d.type || '').toUpperCase();
								} else {
									d = { };
								}

								if (t === 'KEY') {
									sql += ' INTEGER PRIMARY KEY AUTOINCREMENT';
								} else {
									// type
									switch (t) {
										case 'BOOL':
										case 'BOOLEAN':
										case 'INTEGER':
										case 'INT':
											sql += ' INTEGER';
											break;
										case 'REAL':
										case 'DECIMAL':
										case 'FLOAT':
											sql += ' REAL';
											break;
										case 'BLOB':
										case 'LONGTEXT':
											sql += ' BLOB';
											break;
										// case 'TEXT':
										// case 'DATE':
										// case 'DATETIME':
										default:
											sql += d.foreign ? ' INTEGER' : ' TEXT';
											break;
									}
									// primary
									if (d.primary) {
										sql += ' PRIMARY KEY';
									}
									// autoincrement
									if (d.autoincrement) {
										sql += ' AUTOINCREMENT';
									}
									// unique
									if (d.unique) {
										sql += ' UNIQUE';
									}
									// NOT NULL
									if (d.null === false) {
										sql += ' NOT NULL';
									} else {
										// IS NULL
										sql += ' NULL';
									}
									// default
									if (d.default !== undefined) {
										sql += ' DEFAULT ' + prepareVar(d.default, true, true);
									}
									// Foreign
									if (d.foreign) {
										if (typeof d.foreign === 'string') {
											f = d.foreign.split('.');
											d = {
												table: f[0],
												key: f[1] || 'id'
											};
										} else {
											d = d.foreign;
											if (!d.key) {
												d.key = 'id';
											}
										}
										sql += ' REFERENCES ' + d.table + '(' + d.key + ')';
									}
								}
							}
						})

						// Foreign (other method)
						// for (c in definition) {
						//   if (definition.hasOwnProperty(c)) {
						//     d = definition[c];
						//     if (d && (typeof d !== 'string') && d.foreign) {
						//       if (typeof d.foreign === 'string') {
						//         f = d.foreign.split('.');
						//         d = {
						//           table: f[0],
						//           key: f[1]
						//         };
						//       } else {
						//         d = d.foreign;
						//       }
						//       sql += ', FOREIGN KEY(' + c + ') REFERENCES ' + d.table + '(' + d.key + ')';
						//     }
						//   }
						// }

						sql += ' )';

						// Finish

						function _finish() {
							deferred.resolve();
						}

						// Create table

						function _ct() {
							var q = $this.execute(sql);
							if (!tableEmpty && initData) {
								q.then(function () {
									$this.insert(table, initData)
										.then(_finish);
								});
							} else {
								q.then(_finish)
							}
						}

						// Drop table
						if (definition.__dropTable) {
							$this.execute('DROP TABLE IF EXISTS ' + table).then(_ct);
						} else {
							_ct();
						}
					});
			});

			return deferred.promise;
		},

		/**
		 * Drop Table if Exists.
		 *
		 * @param {String} table Table Name.
		 */
		dropTable: function (table) {
			var deferred = $q.defer();

			_db.transaction(function (tx) {
				var sql = 'DROP TABLE IF EXISTS ' + table;
				console.log('$SQLite', 'dropTable', sql);
				tx.executeSql(sql, [],
					function (tx, results) { deferred.resolve(results); },
					function (tx, error) { console.error(error); deferred.reject(error); });
			});

			return deferred.promise;
		},

		/**
		 * Execute Query.
		 *
		 * @param {String} sql Script SQL to execute.
		 *        SELECT * FROM usuarios WHERE username = ? AND password = ?
		 * @param {Array|Function} params
		 *        {Array}: Parameters.
		 *            [ 'user', '123456' ]
		 */
		execute: function (sql, params) {
			var t = this;
			var deferred = $q.defer();
			sql = '' + sql;
			_db.transaction(function (tx) {
				params = prepareParams(params);
				console.log('$SQLite', 'execute', sql, params);
				tx.executeSql(sql, params,
					function (tx, results) { deferred.resolve(results); },
					function (tx, error) { console.error(error); deferred.reject(error); });
			});

			return deferred.promise;
		},

		/**
		 * Select Query.
		 *
		 * @param {String} sql Script SQL to execute.
		 *        SELECT * FROM usuarios WHERE username = ? AND password = ?
		 * @param {Array|Function} params
		 *        {Array}: Parameters.
		 *            [ 'user', '123456' ]
		 */
		select: function (sql, params) {
			var t = this;
			var deferred = $q.defer();
			sql = '' + sql;

			_db.transaction(function (tx) {
				params = prepareParams(params);
				console.log('$SQLite', 'select', sql, params);
				tx.executeSql(sql, params, function (tx, results) {
					var len = results.rows.length, i;

					if (len > 0) {
						// For each item...
						for (i = 0; i < len; i++) {
							deferred.notify({
								result: results,
								item: results.rows.item(i),
								index: i,
								count: len
							});
						}
					} else {
						// Empty
						deferred.resolve(results);
					}
				}, function (tx, error) { console.error(error); deferred.reject(error); });
			});

			return deferred.promise;
		},

		/**
		 * Select Query.
		 *
		 * @param {String} sql Script SQL to execute.
		 *        SELECT * FROM usuarios WHERE username = ? AND password = ?
		 * @param {Array|Function} params
		 *        {Array}: Parameters.
		 *            [ 'user', '123456' ]
		 */
		selectFirst: function (sql, params) {
			var t = this;
			var deferred = $q.defer();
			sql = '' + sql;

			_db.transaction(function (tx) {
				params = prepareParams(params);
				console.log('$SQLite', 'selectFirst', sql, params);
				tx.executeSql(sql, params, function (tx, results) {
					var len = results.rows.length;
					if (len > 0) {
						// First item
						deferred.notify({
							result: results,
							item: results.rows.item(0),
							count: len
						});
					} else {
						// Empty
						deferred.resolve(results);
					}
				}, function (tx, error) { console.error(error); deferred.reject(error); });
			});

			return deferred.promise;
		},

		/**
		 * Select Query.
		 *
		 * @param {String} sql Script SQL to execute.
		 *        SELECT * FROM usuarios WHERE username = ? AND password = ?
		 * @param {Array|Function} params
		 *        {Array}: Parameters.
		 *            [ 'user', '123456' ]
		 */
		selectAll: function (sql, params, fnResult, fnEmpty) {
			var t = this;
			var deferred = $q.defer();
			sql = '' + sql;

			_db.transaction(function (tx) {
				params = prepareParams(params);
				console.log('$SQLite', 'selectAll', sql, params);
				tx.executeSql(sql, params, function (tx, results) {
					var len = results.rows.length, i;
					if (len > 0) {
						var rows = [];
						for (i = 0; i < len; i++) {
							rows.push(results.rows.item(i));
						}
						// All items
						deferred.notify({
							result: results,
							rows: rows,
							count: len
						});
					} else {
						// Empty
						deferred.resolve(results);
					}
				}, function (tx, error) { console.error(error); deferred.reject(error); });
			});

			return deferred.promise;
		},

		/**
		 * Insert.
		 *
		 * @param {String} table Table name.
		 * @param {Object|Array} data Column data.
		 *        { id: 1, name: 'test' }
		 *        [{ id: 1, name: 'test' }, { id: 2, name: 'foo' }]Finish!');
		 */
		insert: function (table, data) {
			return insert_replace.call(this, 'INSERT', table, data);
		},

		/**
		 * Replace.
		 *
		 * @param {String} table Table name.
		 * @param {Object|Array} data Column data.
		 *        { id: 1, name: 'test' }
		 *        [{ id: 1, name: 'test' }, { id: 2, name: 'foo' }]
		 */
		replace: function (table, data) {
			return insert_replace.call(this, 'REPLACE', table, data);
		},

		/**
		 * Returns TRUE if table exists.
		 *
		 * @param {String} tableName Table name.
		 */
		tableExists: function (tableName) {
			var t = this;
			var deferred = $q.defer();

			_db.transaction(function (tx) {
				var sql = "SELECT name FROM sqlite_master WHERE type='table' AND name=?;";
				console.log('$SQLite', 'tableExists', sql, tableName);
				tx.executeSql(
					sql, [ tableName ],
					function (tx, results) { deferred.resolve(results); },
					function (tx, error) { console.error(error); deferred.reject(error); }
				);
			});

			return deferred.promise;
		},

		init: function (initFn) {
			console.log('$SQLite', 'init', 'start');
			var _ = this,
				stepCount = 1;
			_.init = _.ready;

			if (angular.isFunction(initFn)) {
				var actions = {
					step: function () { stepCount++; },
					done: function () { actions.finish(); },
					finish: function () {
						stepCount--;
						if (stepCount === 0) {
							_initDeferred.resolve();
						}
					}
				};

				initFn.apply(_, [actions]);
			}

			_initDeferred.promise.then(function () {
				console.log('$SQLite', 'init', 'ready');
				_db_initialited = true;
				if (_initFns.length) {
					for (var i = 0; i < _initFns.length; i++) {
						_initFns[i].apply(_);
					}
				}
				console.log('$SQLite', 'init', 'finish');
			});

			return this;
		},

		ready: function (fn) {
			if (!angular.isFunction(fn)) throw 'Error! "fn" is not a Function';

			if (_db_initialited) {
				fn.apply(this);
			} else {
				_initFns.push(fn);
			}

			return this;
		},

		isReady: function () { return _db_initialited; }
	};
}]);
