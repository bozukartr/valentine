import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

const firebaseConfig = {
    apiKey: "AIzaSyB0SExeqaBDZSxpOFlIerQxlK5tx_8q3GY",
    authDomain: "valentine-b387c.firebaseapp.com",
    projectId: "valentine-b387c",
    storageBucket: "valentine-b387c.firebasestorage.app",
    messagingSenderId: "59756560868",
    appId: "1:59756560868:web:fc4a0f9fdd5ef2f94f87f1",
    measurementId: "G-QTYTJTWH1F"
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
