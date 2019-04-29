
const debugModule = require('debug');
debugModule.enable('*');
const debug = debugModule('tuya_to_mqtt');

const _ = require('lodash');
const CloudTuya = require('cloudtuya');
const mqtt = require('mqtt');
const config = require('config');

const tuyaConfig = config.get('tuya');
const mqttConfig = config.get('mqtt');
const devices = config.get('devices');

const state = _
  .chain(devices)
  .keyBy('deviceId')
  .mapValues(val => ({
    ...val,
    state: false,
  }))
  .value();

async function main() {
  debug(state);
}

main();