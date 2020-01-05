"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const NodeAdapter_1 = require("./adapters/NodeAdapter");
var Client_1 = require("./Client");
exports.Client = Client_1.default;
var NodeAdapter_2 = require("./adapters/NodeAdapter");
exports.Adapter = NodeAdapter_2.Adapter;
exports.default = NodeAdapter_1.default;
