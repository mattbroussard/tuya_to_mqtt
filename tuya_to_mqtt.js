
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

let tuyaClient;
let mqttClient;
let mqttTopics = {};

const state = _
  .chain(devices)
  .keyBy('deviceId')
  .mapValues(val => ({
    ...val,
    state: false,
  }))
  .value();

let refreshing = true;

function asyncOneAtATime(fn, memo) {
  let currentPromise = null;

  return function() {
    if (currentPromise) {
      debug('received call to %s while one already in progress. returning orig promise.', memo);
      return currentPromise;
    }

    currentPromise = fn.apply(this, arguments).then(value => {
      currentPromise = null;
      return value;
    }, exception => {
      currentPromise = null;
      throw exception;
    });

    return currentPromise;
  };
}

function onMqttMessage(topic, message) {
  if (topic in mqttTopics) {
    const fn = mqttTopics[topic];
    fn(message);
  } else {
    debug('received message on unknown mqtt topic', topic);
  }
}

async function mqttSubscribe(topic, fn) {
  return new Promise((resolve, reject) => {
    mqttTopics[topic] = fn;

    mqttClient.subscribe(topic, err => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

async function handleSetStateMessage(deviceId, message) {
  ////
}

const refresh = asyncOneAtATime(async () => {
  // ...
}, 'refresh');

async function main() {
  debug("Logging into Tuya...");
  // Need to copy the config object because CloudTuya modifies it to add default properties
  tuyaClient = new CloudTuya({...tuyaConfig});
  await tuyaClient.login();

  debug("Connecting to MQTT...");
  mqttClient = mqtt.connect(mqttConfig.brokerAddress);
  mqttClient.on('message', onMqttMessage);

  debug("Setting up MQTT listeners");
  const mqttSubscribePromises = _.map(state, device => {
    const {topicPrefix} = mqttConfig;

    const refreshTopic = `${topicPrefix}/${device.topic}/refresh`;
    const refreshSub = mqttSubscribe(refreshTopic, refresh);

    const setTopic = `${topicPrefix}/${device.topic}/set_state`;
    const setSub = mqttSubscribe(setTopic, (message) => handleSetStateMessage(device.deviceId, message));

    return Promise.all([refreshSub, setSub]);
  });
  await Promise.all(mqttSubscribePromises);

  debug("Running initial Tuya refresh.");
  await refresh();
}

main();