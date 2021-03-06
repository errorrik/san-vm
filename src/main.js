/**
 * san-core
 * Copyright 2016 Baidu Inc. All rights reserved.
 *
 * @file 组件体系，vm引擎
 * @author errorrik(errorrik@gmail.com)
 */


(function (root) {

    // #region utils
    /**
     * 对象属性拷贝
     *
     * @inner
     * @param {Object} target 目标对象
     * @param {Object} source 源对象
     * @return {Object} 返回目标对象
     */
    function extend(target, source) {
        for (var key in source) {
            if (source.hasOwnProperty(key)) {
                target[key] = source[key];
            }
        }

        return target;
    }

    /**
     * 构建类之间的继承关系
     *
     * @inner
     * @param {Function} subClass 子类函数
     * @param {Function} superClass 父类函数
     */
    function inherits(subClass, superClass) {
        /* jshint -W054 */
        var subClassProto = subClass.prototype;
        var F = new Function();
        F.prototype = superClass.prototype;
        subClass.prototype = new F();
        subClass.prototype.constructor = subClass;
        extend(subClass.prototype, subClassProto);
        /* jshint +W054 */
    }

    /**
     * 遍历数组集合
     *
     * @inner
     * @param {Array} source 数组源
     * @param {function(*,Number):boolean} iterator 遍历函数
     * @param {Object=} thisArg this指向对象
     */
    function each(array, iterator, thisArg) {
        if (array && array.length > 0) {
            for (var i = 0, l = array.length; i < l; i++) {
                if (iterator.call(thisArg || array, array[i], i) === false) {
                    break;
                }
            }
        }
    }

    /**
     * Function.prototype.bind 方法的兼容性封装
     *
     * @inner
     * @param {Function} func 要bind的函数
     * @param {Object} thisArg this指向对象
     * @param {...*} args 预设的初始参数
     * @return {Function}
     */
    function bind(func, thisArg) {
        var nativeBind = Function.prototype.bind;
        var slice = Array.prototype.slice;
        if (nativeBind && func.bind === nativeBind) {
            return nativeBind.apply(func, slice.call(arguments, 1));
        }

        var args = slice.call(arguments, 2);
        return function () {
            func.apply(thisArg, args.concat(slice.call(arguments)));
        };
    }

    /**
     * DOM 事件挂载
     *
     * @inner
     * @param {HTMLElement} el
     * @param {string} eventName
     * @param {Function} listener
     */
    function on(el, eventName, listener) {
        if (el.addEventListener) {
            el.addEventListener(eventName, listener, false);
        }
        else {
            el.attachEvent('on' + eventName, listener);
        }
    }

    /**
     * DOM 事件卸载
     *
     * @inner
     * @param {HTMLElement} el
     * @param {string} eventName
     * @param {Function} listener
     */
    function un(el, eventName, listener) {
        if (el.addEventListener) {
            el.removeEventListener(eventName, listener, false);
        }
        else {
            el.detachEvent('on' + eventName, listener);
        }
    }

    /**
     * 唯一id的起始值
     *
     * @inner
     * @type {number}
     */
    var guidIndex = 1;

    /**
     * 获取唯一id
     *
     * @inner
     * @return {string} 唯一id
     */
    function guid() {
        return '_san-vm_' + (guidIndex++);
    }

    /**
     * 下一个周期要执行的任务列表
     *
     * @inner
     * @type {Array}
     */
    var nextTasks = [];

    /**
     * 执行下一个周期任务的函数
     *
     * @inner
     * @type {Function}
     */
    var nextHandler;

    /**
     * 在下一个时间周期运行任务
     *
     * @inner
     * @param {Function} 要运行的任务函数
     */
    function nextTick(func) {
        nextTasks.push(func);

        if (nextHandler) {
            return;
        }

        nextHandler = function () {
            var tasks = nextTasks.slice(0);
            nextTasks = [];
            nextHandler = null;

            for (var i = 0, l = tasks.length; i < l; i++) {
                tasks[i]();
            }
        };

        if (typeof MutationObserver === 'function') {
            var num = 1;
            var observer = new MutationObserver(nextHandler);
            var text = document.createTextNode(num);
            observer.observe(text, {
                characterData: true
            });
            text.data = ++num;
        }
        else if (typeof setImmediate === 'function') {
            setImmediate(nextHandler);
        }
        else {
            setTimeout(nextHandler, 0);
        }
    }

    /**
     * 字符串连接时是否使用老式的兼容方案
     *
     * @inner
     * @type {boolean}
     */
    var compatStringJoin = (function () {
        var ieVersionMatch = typeof navigator !== 'undefined'
            && navigator.userAgent.match(/msie\s*([0-9]+)/i);

        return ieVersionMatch && ieVersionMatch[1] - 0 < 8;
    })();

    /**
     * 写个用于跨平台提高性能的字符串连接类
     * 万一不小心支持老式浏览器了呢
     *
     * @inner
     * @class
     */
    function StringBuffer() {
        this.raw = compatStringJoin ? [] : '';
    }

    /**
     * 获取连接的字符串结果
     *
     * @inner
     * @return {string}
     */
    StringBuffer.prototype.toString = function () {
        return compatStringJoin ? this.raw.join('') : this.raw;
    };

    /**
     * 增加字符串片段
     * 就不支持多参数，别问我为什么，这东西也不是给外部用的
     *
     * @inner
     * @param {string} source 字符串片段
     */
    StringBuffer.prototype.push = compatStringJoin
        ? function (source) {
            this.raw.push(source);
        }
        : function (source) {
            this.raw += source;
        };

    /**
     * 索引列表，能根据 item 中的 name 进行索引
     *
     * @inner
     * @class
     */
    function IndexedList() {
        this.raw = [];
        this.index = {};
    }

    /**
     * 在列表末尾添加 item
     *
     * @inner
     * @param {Object} item 要添加的对象
     */
    IndexedList.prototype.push = function (item) {
        if (!item.name) {
            throw new Error('Object must have "name" property');
        }

        if (!this.index[item.name]) {
            this.raw.push(item);
            this.index[item.name] = item;
        }
    };

    /**
     * 根据顺序下标获取 item
     *
     * @inner
     * @param {number} index 顺序下标
     * @return {Object}
     */
    IndexedList.prototype.getAt = function (index) {
        return this.raw[index];
    };

    /**
     * 根据 name 获取 item
     *
     * @inner
     * @param {string} name name
     * @return {Object}
     */
    IndexedList.prototype.get = function (name) {
        return this.index[name];
    };

    /**
     * 遍历 items
     *
     * @inner
     * @param {function(*,Number):boolean} iterator 遍历函数
     * @param {Object} thisArg 遍历函数运行的this环境
     */
    IndexedList.prototype.each = function (iterator, thisArg) {
        each(this.raw, bind(iterator, thisArg || this));
    };

    /**
     * 根据顺序下标移除 item
     *
     * @inner
     * @param {number} index 顺序
     */
    IndexedList.prototype.removeAt = function (index) {
        var name = this.raw[index].name;
        delete this.index[name];
        this.raw.splice(index, 1);
    };

    /**
     * 根据 name 移除 item
     *
     * @inner
     * @param {string} name name
     */
    IndexedList.prototype.remove = function (name) {
        delete this.index[name];

        var len = this.raw.length;
        while (len--) {
            if (this.raw[len].name === name) {
                this.raw.splice(len, 1);
                break;
            }
        }
    };

    /**
     * 连接另外一个 IndexedList，返回一个新的 IndexedList
     *
     * @inner
     * @param {IndexedList} other 要连接的IndexedList
     * @return {IndexedList}
     */
    IndexedList.prototype.concat = function (other) {
        var result = new IndexedList();
        each(this.raw.concat(other.raw), function (item) {
            result.push(item);
        });

        return result;
    };

    /**
     * 判断标签是否应自关闭
     *
     * @inner
     * @param {string} tagName 标签名
     * @return {boolean}
     */
    function tagIsAutoClose(tagName) {
        return /^(img|input)$/i.test(tagName)
    }

    // #region parse
    /**
     * 表达式类型
     *
     * @inner
     * @const
     * @type {Object}
     */
    var ExprType = {
        STRING: 1,
        NUMBER: 2,
        IDENT: 3,
        PROP_ACCESSOR: 4,
        INTERPOLATION: 5,
        CALL: 6,
        TEXT: 7,
        BINARY: 8,
        UNARY: 9
    };

    /**
     * 字符串源码读取类，用于模板字符串解析过程
     *
     * @inner
     * @class
     * @param {string} source 要读取的字符串
     */
    function Walker(source) {
        this.source = source;
        this.len = this.source.length;
        this.index = 0;
    }

    /**
     * 获取当前字符码
     *
     * @return {number}
     */
    Walker.prototype.currentCode = function () {
        return this.charCode(this.index);
    };

    /**
     * 获取当前读取位置
     *
     * @return {number}
     */
    Walker.prototype.currentIndex = function () {
        return this.index;
    };

    /**
     * 截取字符串片段
     *
     * @param {number} start 起始位置
     * @param {number} end 结束位置
     * @return {string}
     */
    Walker.prototype.cut = function (start, end) {
        return this.source.slice(start, end);
    };

    /**
     * 向前读取字符
     *
     * @param {number} distance 读取字符数
     */
    Walker.prototype.go = function (distance) {
        this.index += distance;
    };

    /**
     * 读取下一个字符，返回下一个字符的 code
     *
     * @return {number}
     */
    Walker.prototype.nextCode = function () {
        this.go(1);
        return this.currentCode();
    };

    /**
     * 获取相应位置字符的 code
     *
     * @return {number}
     */
    Walker.prototype.charCode = function (index) {
        return this.source.charCodeAt(index);
    };

    /**
     * 向前读取字符，直到遇到指定字符再停止
     *
     * @param {number} charCode 指定字符的code
     */
    Walker.prototype.goUtil = function (charCode) {
        var code;
        while (this.index < this.len && (code = this.currentCode())) {
            if (code === 32 || code === 9) {
                this.index++;
            }
            else {
                if (code === charCode) {
                    this.index++;
                    return true;
                }
                return false;
            }
        }
    };

    /**
     * 向前读取符合规则的字符片段，并返回规则匹配结果
     *
     * @param {RegExp} reg 字符片段的正则表达式
     * @return {Array}
     */
    Walker.prototype.match = function (reg) {
        reg.lastIndex = this.index;

        var match = reg.exec(this.source);
        if (match) {
            this.index = reg.lastIndex;
        }

        return match;
    };

    /**
     * 模板解析生成的抽象节点
     *
     * @class
     * @inner
     * @param {Object=} options 节点参数
     * @param {stirng=} options.tagName 标签名
     * @param {ANode=} options.parent 父节点
     * @param {boolean=} options.isText 是否文本节点
     */
    function ANode(options) {
        this.directives = new IndexedList();
        this.binds = new IndexedList();
        this.events = new IndexedList();
        this.childs = [];

        extend(this, options);
    }

    /**
     * 解析 template
     *
     * @inner
     * @param {string} source template 源码
     * @return {node.Root}
     */
    function parseTemplate(source) {
        var rootNode = new ANode();

        if (typeof source !== 'string') {
            return rootNode;
        }

        source = source.replace(/<!--([\s\S]*?)-->/mg, '').replace(/(^\s+|\s+$)/g, '');
        var walker = new Walker(source);

        var tagReg = /<(\/)?([a-z0-9-]+)\s*/ig;
        var attrReg = /([-:0-9a-z\(\)\[\]]+)(=(['"])([^\3]+?)\3)?\s*/ig;

        var tagMatch;
        var currentNode = rootNode;
        var beforeLastIndex = 0;

        while ((tagMatch = walker.match(tagReg)) != null) {
            var tagEnd = tagMatch[1];
            var tagName = tagMatch[2].toLowerCase();

            pushTextNode(source.slice(
                beforeLastIndex,
                walker.currentIndex() - tagMatch[0].length
            ));

            // 62: >
            // 47: /
            if (tagEnd && walker.currentCode() === 62) {
                // 满足关闭标签的条件时，关闭标签
                // 向上查找到对应标签，找不到时忽略关闭
                var closeTargetNode = currentNode;
                while (closeTargetNode && closeTargetNode.tagName !== tagName) {
                    closeTargetNode = closeTargetNode.parent;
                }

                closeTargetNode && (currentNode = closeTargetNode.parent);
                walker.go(1);
            }
            else if (!tagEnd) {
                var aElement = new ANode({
                    tagName: tagName,
                    parent: currentNode
                });
                var tagClose = tagIsAutoClose(tagName);

                // 解析 attributes
                while (1) {
                    var nextCharCode = walker.currentCode();

                    // 标签结束时跳出 attributes 读取
                    // 标签可能直接结束或闭合结束
                    if (nextCharCode === 62) {
                        walker.go(1);
                        break;
                    }
                    else if (nextCharCode === 47
                        && walker.charCode(walker.currentIndex() + 1) === 62
                    ) {
                        walker.go(2);
                        tagClose = true;
                        break;
                    }

                    // 读取 attribute
                    var attrMatch = walker.match(attrReg);
                    if (attrMatch) {
                        integrateAttr(
                            aElement,
                            attrMatch[1],
                            attrMatch[2] ? attrMatch[4] : ''
                        );
                    }
                }

                currentNode.childs.push(aElement);
                if (!tagClose) {
                    currentNode = aElement;
                }
            }

            beforeLastIndex = walker.currentIndex();
        }

        pushTextNode(walker.cut(beforeLastIndex));

        return rootNode;

        /**
         * 在读取栈中添加文本节点
         *
         * @inner
         * @param {string} 文本内容
         */
        function pushTextNode(text) {
            if (text) {
                currentNode.childs.push(new ANode({
                    isText: true,
                    text: text,
                    parent: currentNode
                }));
            }
        }

        /**
         * 解析抽象节点属性
         *
         * @inner
         * @param {ANode} aNode 抽象节点
         * @param {string} name 属性名称
         * @param {string} value 属性值
         */
        function integrateAttr(aNode, name, value) {
            var prefixIndex = name.indexOf('-');
            var prefix;
            var realName;

            if (name === 'id') {
                aNode.id = value;
            }

            if (prefixIndex > 0) {
                prefix = name.slice(0, prefixIndex);
                realName = name.slice(prefixIndex + 1);
            }

            switch (prefix) {
                case 'on':
                    aNode.events.push({
                        name: realName,
                        expr: parseCall(value)
                    });
                    break;

                case 'bind':
                    aNode.binds.push({
                        name: realName,
                        expr: parseExpr(value)
                    });
                    break;

                case 'bindx':
                    aNode.binds.push({
                        name: realName,
                        expr: parseExpr(value),
                        twoWay: true
                    });
                    break;

                case 'san':
                    aNode.directives.push(parseDirective(realName, value));
                    break;

                default:
                    aNode.binds.push({
                        name: name,
                        expr: parseText(value)
                    });
            }
        }
    }

    /**
     * 指令解析器
     *
     * @type {Object}
     * @inner
     */
    var directiveParsers = {
        'for': function (value) {
            var walker = new Walker(value);
            var match = walker.match(/^\s*([\$0-9a-z_]+)(\s*,\s*([\$0-9a-z_]+))?\s+in\s+/ig);

            if (match) {
                return {
                    item: match[1],
                    index: match[3],
                    list: readPropertyAccessor(walker)
                };
            }

            throw new Error('for syntax error: ' + value);
        },

        'ref': function (value) {
            return {value: value};
        }
    };

    /**
     * 解析指令
     *
     * @inner
     * @param {string} name 指令名称
     * @param {string} value 指令值
     * @return {Object=}
     */
    function parseDirective(name, value) {
        var parser = directiveParsers[name];
        if (parser) {
            var result = parser(value);
            result.name = name;
            return result;
        }

        return null;
    }

    /**
     * 解析文本
     *
     * @inner
     * @param {string} source 源码
     * @return {Object}
     */
    function parseText(source) {
        var exprStartReg = /\{\{\s*([\s\S]+?)\s*\}\}/ig;
        var exprMatch;

        var walker = new Walker(source);
        var segs = [];
        var beforeIndex = 0;
        while ((exprMatch = walker.match(exprStartReg)) != null) {
            var beforeText = walker.cut(
                beforeIndex,
                walker.currentIndex() - exprMatch[0].length
            );

            beforeText && segs.push({
                type: ExprType.STRING,
                value: beforeText
            });
            segs.push(parseInterpolation(exprMatch[1]));
            beforeIndex = walker.currentIndex();
        }

        var tail = walker.cut(beforeIndex);
        tail && segs.push({
            type: ExprType.STRING,
            value: tail
        });

        return {
            type: ExprType.TEXT,
            segs: segs
        };
    }

    /**
     * 解析差值替换
     *
     * @inner
     * @param {string} source 源码
     * @return {Object}
     */
    function parseInterpolation(source) {
        var walker = new Walker(source);
        var expr = readLogicalORExpr(walker);

        var filters = [];
        while (walker.goUtil(124)) { // |
            filters.push(readCall(walker));
        }

        return {
            type: ExprType.INTERPOLATION,
            expr: expr,
            filters: filters
        };
    }

    /**
     * 解析表达式
     *
     * @inner
     * @param {string} source 源码
     * @return {Object}
     */
    function parseExpr(source) {
        if (typeof source === 'Object' && source.type) {
            return source;
        }

        return readLogicalORExpr(new Walker(source));
    }

    /**
     * 解析调用
     *
     * @inner
     * @param {string} source 源码
     * @return {Object}
     */
    function parseCall(source) {
        return readCall(new Walker(source));
    }

    /**
     * 读取字符串
     *
     * @inner
     * @param {Walker} walker 源码读取对象
     * @return {Object}
     */
    function readString(walker) {
        var startCode = walker.currentCode();
        var startIndex = walker.currentIndex();
        var char;

        walkLoop: while ((charCode = walker.nextCode())) {
            switch (charCode) {
                case 92: // \
                    walker.go(1);
                    break;
                case startCode:
                    walker.go(1);
                    break walkLoop;
            }
        }

        return {
            type: ExprType.STRING,
            literal: walker.cut(startIndex, walker.currentIndex())
        };
    }

    /**
     * 读取ident
     *
     * @inner
     * @param {Walker} walker 源码读取对象
     * @return {Object}
     */
    function readIdentifier(walker) {
        var match = walker.match(/\s*([\$0-9a-z_]+)/ig);
        return {
            type: ExprType.IDENT,
            name: match[1]
        };
    }

    /**
     * 读取数字
     *
     * @inner
     * @param {Walker} walker 源码读取对象
     * @return {Object}
     */
    function readNumber(walker) {
        var match = walker.match(/\s*(-?[0-9]+(.[0-9]+)?)/g);

        return {
            type: ExprType.NUMBER,
            literal: match[1]
        };
    }

    /**
     * 读取属性访问表达式
     *
     * @inner
     * @param {Walker} walker 源码读取对象
     * @return {Object}
     */
    function readPropertyAccessor(walker) {
        var result = {
            type: ExprType.PROP_ACCESSOR,
            paths: []
        };

        var firstSeg = readIdentifier(walker);
        if (!firstSeg) {
            return null;
        }

        result.paths.push(firstSeg);
        accessorLoop: while (1) {
            var code = walker.currentCode();
            switch (code) {
                case 46: // .
                    walker.go(1);
                    result.paths.push(readIdentifier(walker));
                    break;

                case 91: // [
                    walker.go(1);
                    var itemExpr = readLogicalORExpr(walker);
                    if (itemExpr.type === ExprType.IDENT) {
                        itemExpr = {
                            type: ExprType.PROP_ACCESSOR,
                            paths: [itemExpr]
                        };
                    }
                    result.paths.push(itemExpr);
                    walker.goUtil(93);  // ]
                    break;

                default:
                    break accessorLoop;
            }
        }

        if (result.paths.length === 1) {
            return firstSeg;
        }

        return result;
    }

    function readLogicalORExpr(walker) {
        var expr = readLogicalANDExpr(walker);
        walker.goUtil();

        if (walker.currentCode() === 124) { // |
            if (walker.nextCode() === 124) {
                walker.go(1);
                return {
                    type: ExprType.BINARY,
                    operator: BinaryOp[248],
                    segs: [expr, readLogicalORExpr(walker)]
                };
            }
            else {
                walker.go(-1);
            }
        }

        return expr;
    }

    function readLogicalANDExpr(walker) {
        var expr = readEqualityExpr(walker);
        walker.goUtil();

        if (walker.currentCode() === 38) { // &
            if (walker.nextCode() === 38) {
                walker.go(1);
                return {
                    type: ExprType.BINARY,
                    operator: BinaryOp[76],
                    segs: [expr, readLogicalANDExpr(walker)]
                };
            }
            else {
                walker.go(-1);
            }
        }

        return expr;
    }

    function readEqualityExpr(walker) {
        var expr = readRelationalExpr(walker);
        walker.goUtil();

        var code = walker.currentCode();
        switch (code) {
            case 61: // =
            case 33: // !
                if (walker.nextCode() === 61) {
                    code += 61;
                    if (walker.nextCode() === 61) {
                        walker.go(1);
                        code += 61;
                    }

                    return {
                        type: ExprType.BINARY,
                        operator: BinaryOp[code],
                        segs: [expr, readEqualityExpr(walker)]
                    };
                }
                else {
                    walker.go(-1);
                }
        }

        return expr;
    }

    function readRelationalExpr(walker) {
        var expr = readAdditiveExpr(walker);
        walker.goUtil();

        var code = walker.currentCode();
        switch (code) {
            case 60: // <
            case 62: // >
                if (walker.nextCode() === 61) {
                    code += 61;
                    walker.go(1);
                }

                return {
                    type: ExprType.BINARY,
                    operator: BinaryOp[code],
                    segs: [expr, readRelationalExpr(walker)]
                };
        }

        return expr;
    }

    function readAdditiveExpr(walker) {
        var expr = readMultiplicativeExpr(walker);
        walker.goUtil();

        var code = walker.currentCode();
        switch (code) {
            case 43: // +
            case 45: // -
                walker.go(1);
                return {
                    type: ExprType.BINARY,
                    operator: BinaryOp[code],
                    segs: [expr, readAdditiveExpr(walker)]
                };
        }

        return expr;
    }

    function readMultiplicativeExpr(walker) {
        var expr = readUnaryExpr(walker);
        walker.goUtil();

        var code = walker.currentCode();
        switch (code) {
            case 42: // *
            case 47: // /
                walker.go(1);
                return {
                    type: ExprType.BINARY,
                    operator: BinaryOp[code],
                    segs: [expr, readMultiplicativeExpr(walker)]
                };
        }

        return expr;
    }

    function readUnaryExpr(walker) {
        walker.goUtil();

        switch (walker.currentCode()) {
            case 33: // !
                walker.go(1);
                return {
                    type: ExprType.UNARY,
                    expr: readUnaryExpr(walker)
                };
            case 34: // "
            case 39: // '
                return readString(walker);
            case 45: // number
            case 48:
            case 49:
            case 50:
            case 51:
            case 52:
            case 53:
            case 54:
            case 55:
            case 56:
            case 57:
                return readNumber(walker);
        }

        return readPropertyAccessor(walker);
    }


    var BinaryOp = {
        43: function (a, b) {return a + b;},
        45: function (a, b) {return a - b;},
        42: function (a, b) {return a * b;},
        47: function (a, b) {return a / b;},
        60: function (a, b) {return a < b;},
        62: function (a, b) {return a > b;},
        76: function (a, b) {return a && b;},
        94: function (a, b) {return a != b;},
        121: function (a, b) {return a <= b;},
        122: function (a, b) {return a == b;},
        123: function (a, b) {return a >= b;},
        155: function (a, b) {return a !== b;},
        183: function (a, b) {return a === b;},
        248: function (a, b) {return a || b;}
    };

    /**
     * 读取调用
     *
     * @inner
     * @param {Walker} walker 源码读取对象
     * @return {Object}
     */
    function readCall(walker) {
        walker.goUtil();
        var identifier = readIdentifier(walker);
        var args = [];

        if (walker.goUtil(40)) { // (
            while (!walker.goUtil(41)) { // )
                args.push(readLogicalORExpr(walker));
                walker.goUtil(44); // ,
            }
        }

        return {
            type: ExprType.CALL,
            name: identifier,
            args: args
        };
    }

    function exprsNeedsUpdate(exprs, changeExpr, model) {
        var result = false;
        each(exprs, function (expr) {
            result = exprNeedsUpdate(expr, changeExpr, model);
            return !result;
        });

        return result;
    }

    /**
     * 判断源表达式路径是否包含目标表达式
     *
     * @inner
     * @param {Object} source 源表达式
     * @param {Object} target 目标表达式
     * @param {Model} model 表达式所属数据环境
     * @return {boolean}
     */
    function exprNeedsUpdate(expr, changeExpr, model) {
        if (changeExpr.type === ExprType.IDENT) {
            changeExpr = {
                type: ExprType.PROP_ACCESSOR,
                paths: [changeExpr]
            };
        }

        switch (expr.type) {
            case ExprType.UNARY:
                return exprNeedsUpdate(expr.expr, changeExpr, model);


            case ExprType.TEXT:
            case ExprType.BINARY:
                return exprsNeedsUpdate(expr.segs, changeExpr, model);


            case ExprType.IDENT:
                return expr.name === changeExpr.paths[0].name;


            case ExprType.INTERPOLATION:
                if (!exprNeedsUpdate(expr.expr, changeExpr, model)) {
                    var result = false;
                    each(expr.filters, function (filter) {
                        result = exprsNeedsUpdate(filter.args, changeExpr, model);
                        return !result;
                    });

                    return result;
                }

                return true;


            case ExprType.PROP_ACCESSOR:
                var paths = expr.paths;
                var changePaths = changeExpr.paths;

                var result = true;
                for (var i = 0, len = paths.length, changeLen = changePaths.length; i < len; i++) {
                    var pathExpr = paths[i];

                    if (pathExpr.type === ExprType.PROP_ACCESSOR
                        && exprNeedsUpdate(pathExpr, changeExpr, model)
                    ) {
                        return true;
                    }

                    if (result && i < changeLen
                        && accessorItemValue(pathExpr, model) != accessorItemValue(changePaths[i], model)
                    ) {
                        result = false;
                    }
                }

                return result;
        }

        return false;
    }


    // #region Model

    /**
     * 数据容器类
     *
     * @inner
     * @class
     * @param {Model} parent 父级数据容器
     */
    function Model(parent) {
        this.parent = parent;
        this.listeners = [];
        this.data = {};
    }

    Model.ChangeType = {
        SET: 1,
        ARRAY_PUSH: 2,
        ARRAY_POP: 3,
        ARRAY_SHIFT: 4,
        ARRAY_UNSHIFT: 5,
        ARRAY_REMOVE: 6
    };

    /**
     * 添加数据变更的事件监听器
     *
     * @param {Function} listener 监听函数
     */
    Model.prototype.onChange = function (listener) {
        if (typeof listener === 'function') {
            this.listeners.push(listener);
        }
    };

    /**
     * 移除数据变更的事件监听器
     *
     * @param {Function} listener 监听函数
     */
    Model.prototype.unChange = function (listener) {
        var len = this.listeners.length;
        while (len--) {
            var item = this.listeners[len];
            if (this.listeners[len] === listener) {
                this.listeners.splice(len, 1);
            }
        }
    };

    /**
     * 触发数据变更
     *
     * @param {Object} change 变更信息对象
     */
    Model.prototype.fireChange = function (change) {
        for (var i = 0; i < this.listeners.length; i++) {
            this.listeners[i].call(this, change);
        }
    };

    /**
     * 获取数据项
     *
     * @param {string|Object} expr 数据项路径
     * @return {*}
     */
    Model.prototype.get = function (expr) {
        if (typeof expr === 'string') {
            expr = parseExpr(expr);
        }

        var value = null;

        switch (expr.type) {
            case ExprType.IDENT:
                value = this.data[expr.name];
                break;

            case ExprType.PROP_ACCESSOR:
                var paths = expr.paths;
                value = this.data[paths[0].name];

                for (var i = 1, l = paths.length; value != null && i < l; i++) {
                    var path = paths[i];
                    var pathValue = accessorItemValue(path, this);
                    value = value[pathValue];
                }
        }

        if (value == null && this.parent) {
            return this.parent.get(expr);
        }

        return value;
    };

    /**
     * 设置数据项
     *
     * @param {string|Object} expr 数据项路径
     * @param {*} value 数据值
     * @param {Object=} option 设置参数
     * @param {boolean} option.silence 静默设置，不触发变更事件
     */
    Model.prototype.set = function (expr, value, option) {
        option = option || {};
        if (typeof expr === 'string') {
            expr = parseExpr(expr);
        }

        var data = this.data;
        var prop;

        switch (expr.type) {
            case ExprType.IDENT:
                prop = expr.name;
                break;

            case ExprType.PROP_ACCESSOR:
                var paths = expr.paths;
                for (var i = 0, l = paths.length; i < l - 1; i++) {
                    var path = paths[i];
                    var pathValue = accessorItemValue(path, this);


                    if (data[pathValue] == null) {
                        data[pathValue] = {};
                    }
                    data = data[pathValue];
                }

                prop = accessorItemValue(paths[i], this);
        }

        if (prop != null && data[prop] !== value) {

            data[prop] = value;
            !option.silence && this.fireChange({
                type: Model.ChangeType.SET,
                expr: expr,
                value: value,
                option: option
            });
        }
    };

    /**
     * 数组数据项push操作
     *
     * @param {string|Object} expr 数据项路径
     * @param {*} item 要push的值
     * @param {Object=} option 设置参数
     * @param {boolean} option.silence 静默设置，不触发变更事件
     */
    Model.prototype.push = function (expr, item, option) {
        option = option || {};
        if (typeof expr === 'string') {
            expr = parseExpr(expr);
        }
        var target = this.get(expr);

        if (target instanceof Array) {
            target.push(item);
            !option.silence && this.fireChange({
                expr: expr,
                type: Model.ChangeType.ARRAY_PUSH,
                value: item,
                index: target.length - 1,
                option: option
            });
        }
    };

    /**
     * 数组数据项pop操作
     *
     * @param {string|Object} expr 数据项路径
     * @param {Object=} option 设置参数
     * @param {boolean} option.silence 静默设置，不触发变更事件
     */
    Model.prototype.pop = function (expr, option) {
        option = option || {};
        if (typeof expr === 'string') {
            expr = parseExpr(expr);
        }
        var target = this.get(expr);

        if (target instanceof Array) {
            var value = target.pop();
            !option.silence && this.fireChange({
                expr: expr,
                type: Model.ChangeType.ARRAY_POP,
                value: value,
                index: target.length,
                option: option
            });
        }
    };

    /**
     * 数组数据项shift操作
     *
     * @param {string|Object} expr 数据项路径
     * @param {Object=} option 设置参数
     * @param {boolean} option.silence 静默设置，不触发变更事件
     */
    Model.prototype.shift = function (expr, option) {
        option = option || {};
        if (typeof expr === 'string') {
            expr = parseExpr(expr);
        }
        var target = this.get(expr);

        if (target instanceof Array) {
            var value = target.shift();
            !option.silence && this.fireChange({
                expr: expr,
                type: Model.ChangeType.ARRAY_SHIFT,
                value: value,
                option: option
            });
        }
    };

    /**
     * 数组数据项unshift操作
     *
     * @param {string|Object} expr 数据项路径
     * @param {*} item 要unshift的值
     * @param {Object=} option 设置参数
     * @param {boolean} option.silence 静默设置，不触发变更事件
     */
    Model.prototype.unshift = function (expr, item, option) {
        option = option || {};
        if (typeof expr === 'string') {
            expr = parseExpr(expr);
        }
        var target = this.get(expr);

        if (target instanceof Array) {
            target.unshift(item);
            !option.silence && this.fireChange({
                expr: expr,
                type: Model.ChangeType.ARRAY_UNSHIFT,
                value: item,
                option: option
            });
        }
    };

    /**
     * 数组数据项移除操作
     *
     * @param {string|Object} expr 数据项路径
     * @param {number} index 要移除项的索引
     * @param {Object=} option 设置参数
     * @param {boolean} option.silence 静默设置，不触发变更事件
     */
    Model.prototype.remove = function (expr, index, option) {
        option = option || {};
        if (typeof expr === 'string') {
            expr = parseExpr(expr);
        }
        var target = this.get(expr);

        if (target instanceof Array) {
            if (index < 0 || index >= target.length) {
                return;
            }

            var value = target[index];
            target.splice(index, 1);

            !option.silence && this.fireChange({
                expr: expr,
                type: Model.ChangeType.ARRAY_REMOVE,
                value: value,
                index: index,
                option: option
            });
        }
    };



    /**
     * 获取property accessor单项对应的名称值
     *
     * @inner
     * @param {Object} expr 单项的表达式
     * @param {Model} model 数据对象
     * @return {string}
     */
    function accessorItemValue(expr, model) {
        return expr.type === ExprType.IDENT
            ? expr.name
            : evalExpr(expr, model);
    }

    /**
     * 计算表达式的值
     *
     * @inner
     * @param {Object} expr 表达式对象
     * @param {Model} model 数据容器对象
     * @param {Component=} owner 所属组件环境
     * @return {*}
     */
    function evalExpr(expr, model, owner) {
        switch (expr.type) {
            case ExprType.UNARY:
                return !evalExpr(expr.expr, model, owner);

            case ExprType.BINARY:
                return expr.operator(
                    evalExpr(expr.segs[0], model, owner),
                    evalExpr(expr.segs[1], model, owner)
                );

            case ExprType.STRING:
            case ExprType.NUMBER:
                if (!expr.value) {
                    expr.value = (new Function('return ' + expr.literal))();
                }
                return expr.value;

            case ExprType.IDENT:
            case ExprType.PROP_ACCESSOR:
                return model.get(expr);

            case ExprType.INTERPOLATION:
                var value = evalExpr(expr.expr, model, owner);

                owner && each(expr.filters, function (filter) {
                    var filterName = filter.name.name;
                    var filterFn = owner.filters[filterName] || filters[filterName]

                    if (typeof filterFn === 'function') {
                        var args = [value];
                        each(filter.args, function (arg) {
                            args.push(evalExpr(arg, model, owner));
                        });

                        value = filterFn.apply(owner, args);
                    }
                });

                if (value == null) {
                    value = '';
                }

                return value;

            case ExprType.TEXT:
                var buf = new StringBuffer();
                each(expr.segs, function (seg) {
                    buf.push(evalExpr(seg, model, owner));
                });
                return buf.toString();
        }
    }


    // #region node

    /**
     * 创建节点的工厂方法
     *
     * @inner
     * @param {ANode} aNode 抽象节点
     * @param {Component} owner 节点所属组件
     * @return {Element|TextNode}
     */
    function createNode(aNode, owner, data) {
        var options = {
            aNode: aNode,
            owner: owner,
            data: data
        };

        if (aNode.directives.get('for')) {
            return new ForDirective(options);
        }

        if (aNode.isText) {
            return new TextNode(options);
        }

        var ComponentType = owner.components && owner.components[aNode.tagName]
            || ComponentClasses[aNode.tagName];
        if (ComponentType) {
            var component = new ComponentType(options);
            return component;
        }

        var ElementType = getElementType(aNode);
        return new ElementType(options);
    }

    function getElementType(aNode) {
        return Element;
    }

    /**
     * 节点生命周期信息
     *
     * @inner
     * @type {Object}
     */
    var LifeCycles = {
        inited: {
            name: 'inited',
            value: 1
        },

        compiled: {
            name: 'compiled',
            value: 2
        },

        created: {
            name: 'created',
            value: 3
        },

        attached: {
            name: 'attached',
            value: 4,
            mutex: 'detached'
        },

        detached: {
            name: 'detached',
            value: 5,
            mutex: 'attached'
        },

        disposed: {
            name: 'disposed',
            value: 6,
            mutex: '*'
        },
    };

    /**
     * 生命周期类
     *
     * @inner
     * @class
     */
    function LifeCycle() {
        this.raw = {};
    }

    /**
     * 设置生命周期
     *
     * @paran {string} name 生命周期名称
     */
    LifeCycle.prototype.set = function (name) {
        var lifeCycle = LifeCycles[name];
        if (!lifeCycle) {
            return;
        }

        if (typeof lifeCycle !== 'object') {
            lifeCycle = {
                value: lifeCycle
            };
        }

        if (lifeCycle.mutex) {
            if (lifeCycle.mutex === '*') {
                this.raw = {};
            }

            delete this.raw[lifeCycle.mutex];
        }

        this.raw[lifeCycle.value] = 1;
    };

    /**
     * 是否位于生命周期
     *
     * @paran {string} name 生命周期名称
     * @return {boolean}
     */
    LifeCycle.prototype.is = function (name) {
        var lifeCycle = LifeCycles[name];
        if (typeof lifeCycle !== 'object') {
            lifeCycle = {
                value: lifeCycle
            };
        }

        return !!this.raw[lifeCycle.value];
    };

    /**
     * 使节点到达相应的生命周期，并调用钩子
     *
     * @inner
     * @param {Element} source 目标节点
     * @param {string} name 生命周期名称
     */
    function callHook(source, name) {
        if (source.lifeCycle.is(name)) {
            return;
        }

        source.lifeCycle.set(name);

        if (typeof source[name] === 'function') {
            source[name].call(source);
        }

        if (typeof source['_' + name] === 'function') {
            source['_' + name].call(source);
        }

        var hookMethod = source.hooks && source.hooks[name];
        if (hookMethod) {
            hookMethod.call(source);
        }
    }

    /**
     * 节点基类
     *
     * @inner
     * @class
     * @param {Object} options 初始化参数
     * @param {ANode} options.aNode 抽象信息节点对象
     * @param {Component=} options.owner 所属的组件对象
     */
    function Node(options) {
        options = options || {};

        this.lifeCycle = new LifeCycle();
        this.init(options);
    }

    /**
     * 初始化
     *
     * @param {Object} options 初始化参数
     */
    Node.prototype.init = function (options) {
        this._init(options);
        callHook(this, 'inited');
    };

    /**
     * 初始化行为
     *
     * @param {Object} options 初始化参数
     */
     Node.prototype._init = function (options) {
        this.owner = options.owner;
        this.data = options.data;
        this.aNode = options.aNode;
        this.id = this.aNode && this.aNode.id || guid();
    };

    Node.prototype._created = function () {
        if (!this.el) {
            this.el = document.getElementById(this.id);
        }
    };

    /**
     * 销毁释放元素
     */
    Node.prototype.dispose = function () {
        this._dispose();
        callHook(this, 'disposed');
    };

    /**
     * 销毁释放元素行为
     */
    Node.prototype._dispose = function () {
        this.owner = null;
        this.data = null;
        this.aNode = null;
    };

    /**
     * 计算表达式的结果
     *
     * @param {Object} expr 表达式对象
     * @return {*}
     */
    Node.prototype.evalExpr = function (expr) {
        return evalExpr(expr, this.data, this.owner);
    };

    /**
     * 创建桩的html
     *
     * @inner
     * @param {Node} node 节点对象
     * @return {string}
     */
    function genStumpHTML(node) {
        return '<script type="text/san-vm" id="' + node.id + '"></script>';
    }

    /**
     * 文本节点类
     *
     * @inner
     * @class
     * @param {Object} options 初始化参数
     * @param {ANode} options.aNode 抽象信息节点对象
     * @param {Component} options.owner 所属的组件对象
     */
    function TextNode(options) {
        Node.call(this, options);
    }

    inherits(TextNode, Node);

    /**
     * 初始化行为
     *
     * @param {Object} options 初始化参数
     */
    TextNode.prototype._init = function (options) {
        Node.prototype._init.call(this, options);
        this.expr = parseText(this.aNode.text);
    };

    /**
     * 生成文本节点的HTML
     *
     * @return {string}
     */
    TextNode.prototype.genHTML = function () {
        return (this.evalExpr(this.expr) || ' ') + genStumpHTML(this);
    };

    /**
     * 刷新文本节点的内容
     */
    TextNode.prototype.update = function () {
        var node = document.getElementById(this.id).previousSibling;

        if (node) {
            var textProp = typeof node.textContent === 'string' ? 'textContent' : 'innerText';
            node[textProp] = this.evalExpr(this.expr);
        }
    };

    /**
     * 绑定数据变化时的视图更新函数
     *
     * @param {Object} change 数据变化信息
     */
    TextNode.prototype.updateView = function (change) {
        if (exprNeedsUpdate(this.expr, change.expr, this.data)) {
            this.update();
        }
    };

    /**
     * 销毁文本节点
     */
    TextNode.prototype._dispose = function () {
        this.expr = null;
        Node.prototype._dispose.call(this);
    };



    // #region Element

    /**
     * 元素存储对象
     *
     * @inner
     * @type {Object}
     */
    var elementContainer = {};

    /**
     * 元素类
     *
     * @inner
     * @class
     * @param {Object} options 初始化参数
     * @param {ANode} options.aNode 抽象信息节点对象
     * @param {Component} options.owner 所属的组件对象
     */
    function Element(options) {
        this.childs = [];
        this.listeners = {};
        Node.call(this, options);
    }

    inherits(Element, Node);


    Element.prototype.on = function (name, listener) {
        if (typeof listener !== 'function') {
            return;
        }

        if (!this.listeners[name]) {
            this.listeners[name] = [];
        }
        this.listeners[name].push(listener);
    };

    Element.prototype.un = function (name, listener) {
        var nameListeners = this.listeners[name];

        if (nameListeners instanceof Array) {
            if (!listener) {
                nameListeners.length = 0;
            }
            else {
                var len = nameListeners.length;
                while (len--) {
                    if (listener === nameListeners[len]) {
                        nameListeners.splice(len, 1);
                    }
                }
            }
        }
    };

    Element.prototype.fire = function (name, event) {
        each(this.listeners[name], function (listener) {
            listener.call(this, event);
        }, this);
    };

    /**
     * 初始化行为
     *
     * @param {Object} options 初始化参数
     */
    Element.prototype._init = function (options) {
        Node.prototype._init.call(this, options);

        elementContainer[this.id] = this;
        this.tagName = this.tagName || (this.aNode && this.aNode.tagName) || 'div';
    };

    /**
     * 创建元素DOM行为
     */
    Element.prototype._create = function () {
        if (!this.el) {
            this.el = document.createElement(this.tagName);
            this.el.id = this.id;

            this.aNode.binds.each(function (bind) {
                var value = this.evalExpr(bind.expr);
                if (value != null && typeof value !== 'object') {
                    this.el.setAttribute(bind.name, value);
                }
            }, this);
        }
    };

    /**
     * 创建元素DOM
     */
    Element.prototype.create = function () {
        this._create();
        callHook(this, 'created');
    };

    Element.prototype._created = function () {
        Node.prototype._created.call(this);

        // TODO: 整理下
        this.aNode.binds.each(function (bindInfo) {
            if (bindInfo.twoWay) {
                var me = this;

                if (this instanceof Component) {
                    this.on(bindInfo.name + 'Changed', function (value) {
                        this.parentData && this.parentData.set(bindInfo.expr, value);
                    });

                    this.data.onChange(function (change) {
                        var dataExpr = parseExpr(bindInfo.name);
                        if (exprNeedsUpdate(dataExpr, change.expr, this)) {
                            me.fire(bindInfo.name + 'Changed', evalExpr(dataExpr, this, me));
                        }
                    });
                }

                if (bindInfo.name === 'value') {
                    var elTagName = this.el.tagName;
                    var elType = this.el.type;
                    if ((elTagName === 'INPUT' && elType === 'text') || elTagName === 'TEXTAREA') {
                        on(this.el, ('oninput' in this.el) ? 'input' : 'propertychange', bind(function (e) {
                            this.blockSetOnce = true;
                            this.data.set(bindInfo.expr, (e.target || e.srcElement).value);
                        }, this))
                    }
                }
            }
        }, this);

        this.bindEvents();
    };

    /**
     * 将元素attach到页面
     *
     * @param {HTMLElement} parent 要添加到的父元素
     */
    Element.prototype.attach = function (parentEl, beforeEl) {
        this._attach(parentEl, beforeEl);
        this.bindEvents();
        noticeAttached(this);
    };

    /**
     * 将元素attach到页面的行为
     *
     * @param {HTMLElement} parent 要添加到的父元素
     */
    Element.prototype._attach = function (parentEl, beforeEl) {
        this.create();

        this.aNode.binds.each(function (bind) {
            var value = this.evalExpr(bind.expr);
            this.setProp(bind.name, value);
        }, this);
        this.el.innerHTML = elementGenChildsHTML(this);

        if (parentEl) {
            if (beforeEl) {
                parentEl.insertBefore(this.el, beforeEl);
            }
            else {
                parentEl.appendChild(this.el);
            }
        }
    };

    Element.prototype.bindEvents = function () {
        if (this.eventListeners) {
            return;
        }

        this.eventListeners = {};
        this.aNode.events.each(function (eventBind) {
            var provideFn = elementEventProvider[eventBind.name] || elementEventProvider['*'];
            var listener = provideFn(this, eventBind);

            this.eventListeners[listener.name] = listener.fn;
            on(this.el, listener.name, listener.fn);
        }, this);
    };

    Element.prototype.unbindEvents = function () {
        if (this.eventListeners) {
            for (var key in this.eventListeners) {
                un(this.el, key, this.eventListeners[key]);
            }

            this.eventListeners = null;
        }
    };

    var elementEventProvider = {
        'input': function (element, eventBind) {
            return {
                name: ('oninput' in element.el) ? 'input' : 'propertychange',
                fn: bind(elementInputListener, element, eventBind)
            };
        },

        '*': function (element, eventBind) {
            return {
                name: eventBind.name,
                fn: bind(elementEventListener, element, eventBind)
            };
        }
    };

    function elementInputListener(eventBind, e) {
        if (e.type === 'input' || e.propertyName === 'value') {
            e.value = (e.target || e.srcElement).value;
            elementEventListener.call(this, eventBind, e);
        }
    }

    function elementEventListener(eventBind, e) {
        var args = [];
        var expr = eventBind.expr;

        e = e || window.event;

        each(expr.args, function (argExpr) {
            if (argExpr.type === ExprType.IDENT && argExpr.name === '$event') {
                args.push(e);
            }
            else {
                args.push(this.evalExpr(argExpr));
            }
        }, this);

        var component = this instanceof Component ? this : this.owner;
        var method = component[expr.name.name];
        if (typeof method === 'function') {
            method.apply(component, args);
        }
    }


    /**
     * 通知元素和子元素完成attached状态
     *
     * @inner
     * @param {Element} element 完成attached状态的元素
     */
    function noticeAttached(element) {
        for (var i = 0, l = element.childs ? element.childs.length : 0; i < l; i++) {
            noticeAttached(element.childs[i]);
        }

        callHook(element, 'created');
        callHook(element, 'attached');
    }

    /**
     * 生成元素的html
     *
     * @return {string}
     */
    Element.prototype.genHTML = function () {
        var aNode = this.aNode;
        var buf = new StringBuffer();

        elementGenStartHTML(this, buf);
        buf.push(elementGenChildsHTML(this));
        elementGenCloseHTML(this, buf);

        // this.bindDataListener();
        return buf.toString();
    };

    /**
     * 生成元素标签起始的html
     *
     * @inner
     * @param {Element} element 元素
     * @param {StringBuffer} stringBuffer html串存储对象
     */
    function elementGenStartHTML(element, stringBuffer) {
        if (!element.tagName) {
            return;
        }

        stringBuffer.push('<');
        stringBuffer.push(element.tagName);

        // aNode.id = aNode.id || util.guid();

        stringBuffer.push(' id="');
        stringBuffer.push(element.id);
        stringBuffer.push('"');

        element.aNode.binds.each(function (bind) {
            var value = this.evalExpr(bind.expr);
            if (value != null && typeof value !== 'object') {
                stringBuffer.push(' ');
                stringBuffer.push(bind.name);
                stringBuffer.push('="');
                stringBuffer.push(value);
                stringBuffer.push('"');
            };

        }, element);

        stringBuffer.push('>');
    }

    /**
     * 生成元素标签结束的html
     *
     * @inner
     * @param {Element} element 元素
     * @param {StringBuffer} stringBuffer html串存储对象
     */
    function elementGenCloseHTML(element, stringBuffer) {
        var tagName = element.tagName;
        if (!tagName) {
            return;
        }

        if (!tagIsAutoClose(tagName)) {
            stringBuffer.push('</');
            stringBuffer.push(tagName);
            stringBuffer.push('>');
        }
    }

    /**
     * 生成元素的子元素html
     *
     * @inner
     * @param {Element} element 元素
     * @return {string}
     */
    function elementGenChildsHTML(element) {
        var aNode = element.aNode;

        var buf = new StringBuffer();
        for (var i = 0; i < aNode.childs.length; i++) {
            // bad smell? i dont think so
            // in my view, Component is first class
            var child = createNode(
                aNode.childs[i],
                element instanceof Component ? element : element.owner,
                element.data
            );
            element.childs.push(child);
            buf.push(child.genHTML());
        }

        return buf.toString();
    }

    /**
     * 元素的属性设置函数集合
     *
     * @inner
     * @type {Object}
     */
    var elementPropSetter = {
        '*': function (el, name, value) {
            el[name] = value;
        },

        'class': function (el, name, value) {
            el.className = value;
        },

        'style': function (el, name, value) {
            el.style.cssText = value;
        }
    };

    /**
     * 设置元素属性
     *
     * @param {string} name 属性名称
     * @param {*} name 属性值
     */
    Element.prototype.setProp = function (name, value) {
        if (!this.el) {
            this.el = document.getElementById(this.id);
        }

        if (this.el && this.lifeCycle.is('created') && !this.blockSetOnce) {
            var fn = elementPropSetter[name] || elementPropSetter['*'];
            fn(this.el, name, value);
            this.blockSetOnce = false;
        }
    };

    /**
     * 绑定数据变化时的视图更新函数
     *
     * @param {Object} change 数据变化信息
     */
    Element.prototype.updateView = function (change) {
        this.aNode.binds.each(function (bind) {
            if (exprNeedsUpdate(bind.expr, change.expr, this.data)) {
                this.setProp(bind.name, this.evalExpr(bind.expr));
            }
        }, this);

        each(this.childs, function (child) {
            child.updateView(change);
        });
    };


    /**
     * 将元素从页面上移除
     */
    Element.prototype.detach = function () {
        this._detach();
        callHook(this, 'detached');
    };

    /**
     * 将元素从页面上移除的行为
     */
    Element.prototype._detach = function () {
        if (this.el && this.el.parentNode) {
            this.el.parentNode.removeChild(this.el);
        }
    };

    /**
     * 销毁释放元素的行为
     */
    Element.prototype._dispose = function () {
        this.listeners = null;
        this._disposeChilds();
        this.detach();
        this.unbindEvents();
        this.el = null;
        this.childs = null;
        delete elementContainer[this.id];
        Node.prototype._dispose.call(this);
    };

    /**
     * 销毁释放子元素的行为
     */
    Element.prototype._disposeChilds = function () {
        each(this.childs, function (child) {
            child.dispose();
        });
        this.childs.length = 0;
    };

    // #region Component

    /**
     * 组件类
     *
     * @class
     * @param {Object} options 初始化参数
     */
    function Component(options) {
        this.refs = {};
        Element.call(this, options);
    }

    inherits(Component, Element);

    /**
     * 初始化
     *
     * @param {Object} options 初始化参数
     */
    Component.prototype.init = function (options) {
        Element.prototype._init.call(this, options);

        this._compile();
        callHook(this, 'compiled');

        var ref = this.aNode.directives.get('ref');
        if (ref) {
            this.owner.refs[ref.value] = this;
        }

        this.parentData = this.data;
        this.data = new Model();
        var initData = options.initData || this.initData;
        for (var key in initData) {
            if (initData.hasOwnProperty(key)) {
                this.data.set(key, initData[key]);
            }
        }
        this.parentData && this.aNode.binds.each(function (bind) {
            this.data.set(bind.name, evalExpr(bind.expr, this.parentData, this.owner));
        }, this);

        this.filters = options.filters || this.filters || {};
        if (!this.owner) {
            this.owner = this;
        }
        callHook(this, 'inited');

        // 如果从el编译的，认为已经attach了，触发钩子
        if (this.compileFromEl) {
            callHook(this, 'created');
            callHook(this, 'attached');
            this._listenDataChange();
        }
    };

    /**
     * 模板编译行为
     */
    Component.prototype._compile = function () {
        var tplANode = this.constructor.prototype.aNode;

        if (!this.aNode) {
            this.aNode = tplANode;
        }
        else {
            this.aNode.childs = tplANode.childs;

            this.aNode.binds = this.aNode.binds.concat(tplANode.binds);
            this.aNode.directives = this.aNode.directives.concat(tplANode.directives);
            this.aNode.events = this.aNode.events.concat(tplANode.events);
        }
    };

    Component.prototype.watch = function (dataName, listener) {
        var dataExpr = parseExpr(dataName);
        var me = this;

        this.data.onChange(function (change) {
            if (exprNeedsUpdate(dataExpr, change.expr, this)) {
                listener.call(me, me.evalExpr(dataExpr));
            }
        });
    };

    Component.prototype._inited = function () {
        this._listenDataChange();
    };

    /**
     * 生成数据变化时更新视图的异步方法
     *
     * @inner
     * @param {function(Object)} fn 更新视图的方法，接收数据变更信息对象
     * @param {Component} component 数据变化的组件
     * @return {Function}
     */
    function asyncDataChanger(fn, component) {
        return function (change) {
            nextTick(bind(fn, component, change));
        };
    }

    /**
     * 监听数据变化的行为
     *
     * @private
     */
    Component.prototype._listenDataChange = function () {
        if (this.dataChanger) {
            return;
        }

        if (this !== this.owner) {
            var me = this;

            this.ownerDataChange = function (change) {
                me.aNode.binds.each(function (bind) {

                    if (exprNeedsUpdate(bind.expr, change.expr, this.owner.data)) {
                        this.data.set(bind.name, this.owner.evalExpr(bind.expr));
                    }
                }, me);
            };
            this.owner.data.onChange(this.ownerDataChange);
        }

        this.dataChanger = asyncDataChanger(Element.prototype.updateView, this);
        this.data.onChange(this.dataChanger);
    };

    /**
     * 移除数据变化的行为的监听
     *
     * @private
     */
    Component.prototype._unlistenDataChange = function () {
        if (this.dataChanger) {
            this.data.unChange(this.dataChanger);
            this.dataChanger = null;
        }

        if (this.ownerDataChange) {
            this.owner.data.unChange(this.ownerDataChange);
        }
    };

    Component.prototype.updateView = function (change) {
    };


    /**
     * 将元素attach到页面的行为
     *
     * @param {HTMLElement} parent 要添加到的父元素
     */
    Component.prototype._attach = function (parent) {
        Element.prototype._attach.call(this, parent);
        this._listenDataChange();
    };

    /**
     * 组件销毁的行为
     */
    Component.prototype._dispose = function () {
        this._unlistenDataChange();
        Element.prototype._dispose.call(this);
        this.refs = null;
    };

    Component.prototype.setProp = function (name, value) {
        this.data.set(name, value);
        Element.prototype.setProp.call(this, name, value);
    };

    function ForDirective(options) {
        Element.call(this, options);
    }

    inherits(ForDirective, Element);

    /**
     * 生成html
     *
     * @return {string}
     */
    ForDirective.prototype.genHTML = function () {
        var buf = new StringBuffer();

        eachForData(this, function (item ,i) {
            var child = createForDirectiveChild(this, item, i);
            this.childs.push(child);
            buf.push(child.genHTML());
        });

        buf.push(genStumpHTML(this));

        return buf.toString();
    };

    /**
     * 遍历 for 指令表达式的对应数据
     *
     * @inner
     * @param {ForDirective} forElement for 指令元素对象
     * @param {Function} fn 遍历函数
     */
    function eachForData(forElement, fn) {
        var forDirective = forElement.aNode.directives.get('for');
        var data = forElement.data;
        each(data.get(forDirective.list), fn, forElement);
    }

    /**
     * 创建 for 指令元素的子元素
     *
     * @inner
     * @param {ForDirective} forElement for 指令元素对象
     * @param {*} item 子元素对应数据
     * @param {number} index 子元素对应序号
     * @return {Element}
     */
    function createForDirectiveChild(forElement, item, index) {
        var forDirective = forElement.aNode.directives.get('for');
        var itemData = new Model(forElement.data);
        itemData.set(forDirective.item, item);
        forDirective.index && itemData.set(forDirective.index, index);

        var aNode = forElement.aNode;
        return createNode(
            new ANode({
                text: aNode.text,
                isText: aNode.isText,
                childs: aNode.childs,
                binds: aNode.binds,
                events: aNode.events,
                tagName: aNode.tagName
            }),
            forElement.owner,
            itemData
        );
    }

    /**
     * 绑定数据变化时的视图更新函数
     *
     * @param {Object} change 数据变化信息
     */
    ForDirective.prototype.updateView = function (change) {
        var forDirective = this.aNode.directives.get('for');

        var changeExpr = change.expr;
        var changeSegs = changeExpr.paths;
        if (changeExpr.type === ExprType.IDENT) {
            changeSegs = [changeExpr];
        }
        var changeLen = changeSegs.length;

        var forExpr = forDirective.list;
        var forSegs = forExpr.paths;
        if (forExpr.type === ExprType.IDENT) {
            forSegs = [forExpr];
        }
        var forLen = forSegs.length;

        // changeInForExpr 变量表示变更的数据与 for 指令对应表达式的关系
        // 0 - for 指令对应表达式的“整个数据”发生了变化
        // 1 - for 指令对应表达式的数据的“子项”发生了变化
        // 2 - for 指令对应表达式的数据的“子项的属性”
        // -1 - 变更的不是 for 指令对应表达式的数据
        var changeInForExpr = 0;
        var changeIndex;

        for (var i = 0; i < changeLen && i < forLen; i++) {
            if (accessorItemValue(changeSegs[i]) !== accessorItemValue(forSegs[i])) {
                changeInForExpr = -1;
                break;
            }
        }

        if (changeInForExpr >= 0 && changeLen > forLen) {
            changeIndex = +accessorItemValue(changeSegs[forLen]);
            changeInForExpr = changeLen - forLen === 1 ? 1 : 2;
        }

        switch (changeInForExpr) {
            case -1:
                Element.prototype.updateView.call(this, change);
                break;

            case 0:
                // 对表达式数据本身的数组操作
                // 根据变更类型执行不同的视图更新行为
                switch (change.type) {
                    case Model.ChangeType.ARRAY_PUSH:
                        var newChild = createForDirectiveChild(this, change.value, change.index);
                        this.childs.push(newChild);
                        newChild.attach(this.el.parentNode, this.el.nextSibling);
                        break;

                    case Model.ChangeType.ARRAY_POP:
                        var index = this.childs.length - 1;
                        this.childs[index].dispose();
                        this.childs.splice(index, 1);
                        break;

                    case Model.ChangeType.ARRAY_UNSHIFT:
                        var newChild = createForDirectiveChild(this, change.value, 0);
                        var nextChild = this.childs[0] || this;
                        this.childs.push(newChild);
                        newChild.attach(nextChild.el.parentNode, nextChild.el);
                        updateForDirectiveIndex(this, 1, function (i) {
                            return i + 1;
                        });
                        break;

                    case Model.ChangeType.ARRAY_SHIFT:
                        this.childs[0].dispose();
                        this.childs.splice(0, 1);
                        updateForDirectiveIndex(this, 0, function (i) {
                            return i - 1;
                        });
                        break;

                    case Model.ChangeType.ARRAY_REMOVE:
                        this.childs[change.index].dispose();
                        this.childs.splice(change.index, 1);
                        updateForDirectiveIndex(this, change.index, function (i) {
                            return i - 1;
                        });
                        break;

                    case Model.ChangeType.SET:
                        // 重新构建整个childs
                        this._disposeChilds();
                        eachForData(this, function (item ,i) {
                            var child = createForDirectiveChild(this, item, i);
                            this.childs.push(child);
                            child.attach(this.el.parentNode, this.el);
                        });
                }
                break;

            case 1:
                if (change.type === Model.ChangeType.SET) {
                    // 等于单项时构建单项
                    var newChild = createForDirectiveChild(this, change.value, changeIndex);
                    var replaceChild = this.childs[changeIndex];
                    newChild.attach(replaceChild.el.parentNode, replaceChild.el);
                    replaceChild.dispose();
                    this.childs.splice(changeIndex, 1, newChild);
                }
                break;

            case 2:
                if (change.type === Model.ChangeType.SET) {
                    // 否则让子元素刷新
                    change = extend({}, change);
                    change.expr = {
                        type: ExprType.PROP_ACCESSOR,
                        paths: [
                            {name: forDirective.item, type: ExprType.IDENT}
                        ].concat(changeSegs.slice(forLen + 1))
                    };
                    this.childs[changeIndex].updateView(change);
                }
                break;
        }
    };

    function updateForDirectiveIndex(forElement, start, fn) {
        var childs = forElement.childs;
        var forDirective = forElement.aNode.directives.get('for');
        for (var len = childs.length; start < len; start++) {
            var index = childs[start].data.get(forDirective.index);
            if (index != null) {
                childs[start].data.set(forDirective.index, fn(index));
            }
        }
    }

    // #region exports
    var san = {};

    /**
     * 创建组件类
     *
     * @param {Object} proto
     * @return {Function}
     */
    san.Component = function (proto) {
        function YourComponent(options) {
            Component.call(this, options);
        }

        // pre compile template
        if (proto.template) {
            var aNode = parseTemplate(proto.template);
            var firstChild = aNode.childs[0];

            if (firstChild && firstChild.tagName === 'template') {
                firstChild.tagName = null;
                proto.aNode = firstChild;
            }
            else {
                proto.aNode = aNode;
            }

            proto.template = null;
        }
        else {
            proto.aNode = new ANode();
        }

        YourComponent.prototype = proto;
        inherits(YourComponent, Component);

        if (/^[a-z0-9]+-[a-z0-9]+$/i.test(proto.tagName)) {
            san.register(proto.tagName, YourComponent);
        }

        return YourComponent;
    };

    /**
     * 存储全局 filter 的对象
     *
     * @inner
     * @type {Object}
     */
    var filters = {
        yesToBe: function (condition, value) {
            if (condition) {
                return value;
            }

            return '';
        },

        yesOrNoToBe: function (condition, yesValue, noValue) {
            return condition ? yesValue : noValue;
        }
    };

    /**
     * 注册全局 filter
     *
     * @param {string} name 名称
     * @param {function(*, ...*):*} filter 过滤函数
     */
    san.addFilter = function (name, filter) {
        filters[name] = filter;
    };

    /**
     * 存储全局组件的对象
     *
     * @inner
     * @type {Object}
     */
    var ComponentClasses = {};

    /**
     * 注册全局组件
     *
     * @param {string} name 名称
     * @param {Function} ComponentClass 组件类
     */
    san.register = function (name, ComponentClass) {
        ComponentClasses[name] = ComponentClass;
    };

    /**
     * 在下一个更新周期运行函数
     *
     * @param {Function} fn 要运行的函数
     */
    san.nextTick = nextTick;

    // export
    if (typeof exports === 'object' && typeof module === 'object') {
        // For CommonJS
        exports = module.exports = san;
    }
    else if (typeof define === 'function' && define.amd) {
        // For AMD
        define('san-core', [], san);
        define( [], san);
    }
    else {
        // For <script src="..."
        root.san = san;
    }

})(this);
