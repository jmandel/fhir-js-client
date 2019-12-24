import smart, { Adapter } from "./adapters/NodeAdapter";
import Client from "./Client";

module.exports = smart;
smart.Adapter = Adapter;
smart.Client = Client;
