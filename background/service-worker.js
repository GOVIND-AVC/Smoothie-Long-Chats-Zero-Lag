// background/service-worker.js
'use strict';

// Keep service worker alive
chrome.runtime.onInstalled.addListener(() => {
  console.log('Smoothie Extension installed');
});

// Relay messages between popup and content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Forward statsUpdate from content script to any open popups
  if (message.action === 'statsUpdate') {
    // This message is broadcast; popup listens directly
    return false;
  }
  return false;
});

// Keep service worker alive with periodic alarm
chrome.alarms.create('keepAlive', { periodInMinutes: 0.4 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'keepAlive') {
    // no-op, just prevents SW from dying
  }
});