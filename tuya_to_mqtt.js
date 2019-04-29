
const CloudTuya = require('cloudtuya');
const mqtt = require('mqtt');
const config = require('config');

const tuyaConfig = config.get('tuya');
const mqttConfig = config.get('mqtt');
const devices = config.get('devices');

console.log(devices);