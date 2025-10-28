const WebpayPlus = require('transbank-sdk').WebpayPlus; // CommonJS
const { Options, IntegrationApiKeys, Environment, IntegrationCommerceCodes } = require('transbank-sdk');


let tx;


if (process.env.NODE_ENV === "production") {
  tx = new WebpayPlus.Transaction(new Options(IntegrationCommerceCodes.WEBPAY_PLUS, IntegrationApiKeys.WEBPAY, Environment.Integration));
} else {
  if (!global.__tx__) {
    global.__tx__ = new WebpayPlus.Transaction(new Options(IntegrationCommerceCodes.WEBPAY_PLUS, IntegrationApiKeys.WEBPAY, Environment.Integration));
  }
  tx = global.__tx__;
}

module.exports = { tx };
