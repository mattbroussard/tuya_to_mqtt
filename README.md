# tuya_to_mqtt

This uses [`cloudtuya`](https://github.com/unparagoned/cloudtuya) to talk to Tuya IoT devices using the Smart Life cloud service, then exposes their functionality over MQTT. One use case for this is to control them with HomeKit, which they don't natively support: see my other repo [`homekit_to_mqtt`](https://github.com/mattbroussard/homekit_to_mqtt).

One advantage of using the cloud service as opposed to something like [`tuyapi`](https://github.com/codetheweb/tuyapi) that talks directly to the device is that I can run this in a different network environment than the devices themselves, thus allowing the devices to be sandboxed for better IoT security.