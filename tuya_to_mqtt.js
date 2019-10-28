
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
const miscConfig = config.get('misc');

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

// Timeouts will resolve to undefined instead of throwing. Rejections of the underlying function
// will bubble.
function asyncOneAtATime(fn, memo, timeout) {
  let currentPromise = null;

  return function() {
    if (currentPromise) {
      debug('received call to %s while one already in progress. returning orig promise.', memo);
      return currentPromise;
    }

    currentPromise = new Promise((resolve, reject) => {
      let timer = setTimeout(() => {
        currentPromise = null;
        timer = null;

        debug('call to %s timed out (%dms), returning undefined', memo, timeout);
        resolve(undefined);
      }, timeout);

      fn.apply(this, arguments).then(value => {
        clearTimeout(timer);
        timer = null;

        currentPromise = null;
        resolve(value);
      }, exception => {
        currentPromise = null;
        reject(exception);
      });
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

async function handleSetStateMessage(device, message) {
  let boolVal;

  try {
    boolVal = Boolean(JSON.parse(message));
  } catch (e) {
    debug('Received invalid set state message for %s, ignoring.', device.displayName, e);
    return;
  }

  const changed = boolVal !== device.state;
  device.state = boolVal;
  debug('Received set state message for %s: %s (changed=%s)', device.displayName, boolVal, changed);

  await tuyaClient.setState({
    devId: device.deviceId,
    setState: boolVal,
  });
  debug('Successfully updated state on Tuya');

  emitStateMessage(device);
}

function emitStateMessage(device) {
  const {topicPrefix} = mqttConfig;
  const stateTopic = `${topicPrefix}/${device.topic}/state`;
  mqttClient.publish(stateTopic, JSON.stringify(device.state), {retain: true});
}

const refresh = asyncOneAtATime(async () => {
  debug('Refreshing state from Tuya');
  const tuyaState = await tuyaClient.state();

  _.forEach(tuyaState, (val, deviceId) => {
    const boolVal = val === 'ON';

    const device = state[deviceId];
    if (device) {
      const changed = device.state != boolVal;
      device.state = boolVal;

      emitStateMessage(device);

      debug('Heard new state for %s from Tuya: %s (changed=%s)', device.displayName, boolVal, changed);
    }
  });
}, 'refresh', tuyaConfig.refreshTimeoutMs);

async function connectToMQTT() {
  debug("Connecting to MQTT...");
  mqttClient = mqtt.connect(mqttConfig.brokerAddress, {clientId: mqttConfig.clientId});
  mqttClient.on('message', onMqttMessage);

  await new Promise((resolve, reject) => {
    mqttClient.on('error', reject);
    mqttClient.on('connect', () => resolve());
  });

  debug('Connected to MQTT.');
}

async function main() {
  debug("Logging into Tuya...");
  // Need to copy the config object because CloudTuya modifies it to add default properties
  tuyaClient = new CloudTuya({...tuyaConfig});
  await tuyaClient.login();
  debug("Logged into Tuya.");

  await connectToMQTT();

  debug("Setting up MQTT listeners");
  const mqttSubscribePromises = _.map(state, device => {
    const {topicPrefix} = mqttConfig;

    const refreshTopic = `${topicPrefix}/${device.topic}/refresh`;
    const refreshSub = mqttSubscribe(refreshTopic, () => {
      debug('Received refresh request for %s', device.displayName);
      refresh();
    });

    const setTopic = `${topicPrefix}/${device.topic}/set_state`;
    const setSub = mqttSubscribe(setTopic, (message) => handleSetStateMessage(device, message));

    return Promise.all([refreshSub, setSub]);
  });
  await Promise.all(mqttSubscribePromises);

  debug("Running initial Tuya refresh.");
  await refresh();

  debug("Setting up recurring update (every %dms)", miscConfig.refreshIntervalMs);
  setInterval(async () => {
    debug('Running periodic refresh (every %dms)...', miscConfig.refreshIntervalMs);
    await refresh();
  }, miscConfig.refreshIntervalMs);
}

main();