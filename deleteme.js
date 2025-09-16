// 1. Create an XMLHttpRequest object
var xhttp = new XMLHttpRequest();

// 2. Define a callback function for response
xhttp.onreadystatechange = function() {
  if (this.readyState == 4 && this.status == 200) {
    // Response handling
    console.log(this.responseText);
  }
};

// 3. Open a connection (GET or POST)
xhttp.open("GET", "data.json", true); // GET example
xhttp.send();

xhttp.open("POST", "submit.php", true); // POST example
xhttp.setRequestHeader("Content-type", "application/x-www-form-urlencoded");
xhttp.send("username=john&password=1234");
