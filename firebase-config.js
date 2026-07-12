const firebaseConfig = {
  apiKey: "AIzaSyCdI11L3Y2GFCy4XzbpSwYGchEtFBzj6Sw",
  authDomain: "ferramentas-projeto.firebaseapp.com",
  databaseURL: "https://ferramentas-projeto.firebaseio.com",
  projectId: "ferramentas-projeto",
  storageBucket: "ferramentas-projeto.appspot.com",
  messagingSenderId: "877191590019",
  appId: "1:877191590019:web:e060a55b704e510d53abb6",
  measurementId: "G-23LG8QCPP8"
};

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

const auth = firebase.auth();
const db = firebase.database();
