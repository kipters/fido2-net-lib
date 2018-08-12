function hexEncode(buf) {
    return Array.from(buf)
        .map(function (x) {
            return ("0" + x.toString(16)).substr(-2)
        })
        .join("");
}

function hexDecode(str) {
    return new Uint8Array(str.match(/../g).map(function (x) { return parseInt(x, 16) }));
}

function b64enc(buf) {
    return coerceToBase64Url(buf, "something");
    //return base64js.fromByteArray(buf)
    //    .replace(/\+/g, "-")
    //    .replace(/\//g, "_")
    //    .replace(/=/g, "");
}

coerceToBase64Url = function (thing, name) {
    // Array or ArrayBuffer to Uint8Array
    if (Array.isArray(thing)) {
        thing = Uint8Array.from(thing);
    }

    if (thing instanceof ArrayBuffer) {
        thing = new Uint8Array(thing);
    }

    // Uint8Array to base64
    if (thing instanceof Uint8Array) {
        var str = "";
        var len = thing.byteLength;

        for (var i = 0; i < len; i++) {
            str += String.fromCharCode(thing[i]);
        }
        thing = window.btoa(str);
    }

    if (typeof thing !== "string") {
        throw new Error("could not coerce '" + name + "' to string");
    }

    // base64 to base64url
    // NOTE: "=" at the end of challenge is optional, strip it off here
    thing = thing.replace(/\+/g, "-").replace(/\//g, "_").replace(/=*$/g, "");

    return thing;
};

coerceToArrayBuffer = function (thing, name) {
    if (typeof thing === "string") {
        // base64url to base64
        thing = thing.replace(/-/g, "+").replace(/_/g, "/");

        // base64 to Uint8Array
        var str = window.atob(thing);
        var bytes = new Uint8Array(str.length);
        for (var i = 0; i < str.length; i++) {
            bytes[i] = str.charCodeAt(i);
        }
        thing = bytes;
    }

    // Array to Uint8Array
    if (Array.isArray(thing)) {
        thing = new Uint8Array(thing);
    }

    // Uint8Array to ArrayBuffer
    if (thing instanceof Uint8Array) {
        thing = thing.buffer;
    }

    // error if none of the above worked
    if (!(thing instanceof ArrayBuffer)) {
        throw new TypeError("could not coerce '" + name + "' to ArrayBuffer");
    }

    return thing;
};

// Don't drop any blanks
function b64RawEnc(buf) {
    return b64enc(buf);
    //return base64js.fromByteArray(buf)
    //    //.replace(/\+/g, "-")
    //    //.replace(/\//g, "_")
    //    .replace(/\+/g, "-")
    //    .replace(/\//g, "_")
    //    .replace(/=*$/g, "")
}

function string2buffer(str) {
    return (new Uint8Array(str.length)).map(function (x, i) {
        return str.charCodeAt(i)
    });
}

function buffer2string(buf) {
    let str = "";
    if (!(buf.constructor === Uint8Array)) {
        buf = new Uint8Array(buf);
    }
    buf.map(function (x) { return str += String.fromCharCode(x) });
    return str;
}

var state = {
    createResponse: null,
    publicKeyCredential: null,
    credential: null,
    user: {
        name: "testuser@example.com",
        displayName: "testuser",
    },
}

function setUser() {
    username = $("#input-email").val();
    state.user.name = username.toLowerCase().replace(/\s/g, '') + "@example.com";
    state.user.displayName = username.toLowerCase();
}

function checkUserExists() {
    $.get('/user/' + state.user.name, {}, null, 'json')
        .done(function (response) {
            return true;
        }).catch(function () { return false; });
}

function getCredentials() {
    $.get('/credential/' + state.user.name, {}, null, 'json')
        .done(function (response) {
            console.log(response)
        });
}

function makeCredential() {
    hideErrorAlert();
    console.log("Fetching options for new credential");
    if ($("#input-email").val() === "") {
        showErrorAlert("Please enter a username");
        return;
    }
    setUser();
    var credential = null;
    swal({
        title: 'Registering...',
        text: 'Tap your security key to finish registration.',
        imageUrl: "/images/securitykey.min.svg",
        showCancelButton: true,
        showConfirmButton: false,
        focusConfirm: false,
        focusCancel: false,
    }).then(function () {
        swal({
            title: 'Registration Successful!',
            text: 'You\'ve registered successfully.',
            type: 'success',
            timer: 2000
        })
    }).catch(function (error) {
        console.log("Modal Error: " + error);
    });

    var attestation_type = $('#select-attestation').find(':selected').val();

    $.post('/makeCredentialOptions', {
        username: state.user.name,
        attType: attestation_type
    }, null, 'json')
        .done(function (makeCredentialOptions) {
            console.log("Credential Options Object");
            console.log(makeCredentialOptions);

            // base64url to base64
            const challenge = makeCredentialOptions.challenge.replace(/-/g, "+").replace(/_/g, "/");

            // Turn the challenge back into the accepted format
            makeCredentialOptions.challenge = Uint8Array.from(atob(challenge), c => c.charCodeAt(0));
            // Turn ID into a UInt8Array Buffer for some reason
            makeCredentialOptions.user.id = Uint8Array.from(challenge)

            console.log("Credential Options Formatted");
            console.log(makeCredentialOptions);

            console.log("Creating PublicKeyCredential");
            navigator.credentials.create({
                publicKey: makeCredentialOptions
            }).then(function (newCredential) {
                console.log("PublicKeyCredential Created");
                console.log(newCredential);
                state.createResponse = newCredential;
                registerNewCredential(newCredential);
                swal.clickConfirm()
            }).catch(function (err) {
                console.log(err);
                swal.closeModal();
            });
        });
}

// This should be used to verify the auth data with the server
function registerNewCredential(newCredential) {
    // Move data into Arrays incase it is super long
    let attestationObject = new Uint8Array(newCredential.response.attestationObject);
    let clientDataJSON = new Uint8Array(newCredential.response.clientDataJSON);
    let rawId = new Uint8Array(newCredential.rawId);

    const data = {
        id: newCredential.id,
        rawId: b64enc(rawId),
        type: newCredential.type,
        response: {
            AttestationObject: b64RawEnc(attestationObject),
            clientDataJson: b64RawEnc(clientDataJSON)
        }
    };

    fetch('/makeCredential', {
        method: 'POST', // or 'PUT'
        body: JSON.stringify(data), // data can be `string` or {object}!
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        }
    }).then(res => res.json())
        .catch(error => console.error('Error:', error))
        .then(response => console.log('Success:', response))
        .then(response => {
            if (response.success) {
                window.location.href = "/dashboard/" + state.user.displayName;
            } else {
                console.log("Error creating credential");
                console.log(response);
            }
        });
}

function addUserErrorMsg(msg) {
    if (msg === "username") {
        msg = 'Please add username';
    } else {
        msg = 'Please add email';
    }
    document.getElementById("user-create-error").innerHTML = msg;
}

function getAssertion() {
    hideErrorAlert();
    if ($("#input-email").val() === "") {
        showErrorAlert("Please enter a username");
        return;
    }
    setUser();
    $.get('/user/' + state.user.name, {}, null, 'json').done(function (response) {
        console.log(response);
    }).then(function () {
        swal({
            title: 'Logging In...',
            text: 'Tap your security key to login.',
            imageUrl: "/images/securitykey.min.svg",
            showCancelButton: true,
            showConfirmButton: false,
            focusConfirm: false,
            focusCancel: false,
        }).then(function () {
            swal({
                title: 'Logged In!',
                text: 'You\'re logged in successfully.',
                type: 'success',
                timer: 2000
            })
        }).catch(function (error) {
            console.log("Modal Error: " + error);
        });
    }).catch(function (error) {
        showErrorAlert(error.responseText);
        return;
    });

    $.post('/assertionOptions', {
        username: state.user.name
    }, null, 'json')
        .done(function (makeAssertionOptions) {
            const challenge = makeAssertionOptions.challenge.replace(/-/g, "+").replace(/_/g, "/");
            makeAssertionOptions.challenge = Uint8Array.from(atob(challenge), c => c.charCodeAt(0));

            makeAssertionOptions.allowCredentials.forEach(function (listItem) {
                var fixedId = listItem.id.replace(/\_/g, "/").replace(/\-/g, "+")
                listItem.id = Uint8Array.from(atob(fixedId), c => c.charCodeAt(0));
            });
            console.log(makeAssertionOptions);
            navigator.credentials.get({ publicKey: makeAssertionOptions })
                .then(function (credential) {
                    console.log(credential);
                    verifyAssertion(credential);
                    swal.clickConfirm();
                }).catch(function (err) {
                    console.log(err);
                    showErrorAlert(err.message);
                    swal.closeModal();
                });
        });
}

function verifyAssertion(assertedCredential) {
    // Move data into Arrays incase it is super long
    let authData = new Uint8Array(assertedCredential.response.authenticatorData);
    let clientDataJSON = new Uint8Array(assertedCredential.response.clientDataJSON);
    let rawId = new Uint8Array(assertedCredential.rawId);
    let sig = new Uint8Array(assertedCredential.response.signature);
    const data = {
        id: assertedCredential.id,
        rawId: b64enc(rawId),
        type: assertedCredential.type,
        response: {
            authenticatorData: b64RawEnc(authData),
            clientDataJson: b64RawEnc(clientDataJSON),
            signature: b64RawEnc(sig)
        }
    };

    fetch("/makeAssertion", {
        method: 'POST', // or 'PUT'
        body: JSON.stringify(data), // data can be `string` or {object}!
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        }
    })
        .then(r => r.json())
        .catch(e => console.error(e))
        .then(function (response) {
            console.log(response)
            if (response.success) {
                window.location.href = "/dashboard/" + state.user.displayName;
            } else {
                showErrorAlert("Error Doing Assertion");
                swal.closeModal();
            }
        });
}

function setCurrentUser(userResponse) {
    state.user.name = userResponse.name;
    state.user.displayName = userResponse.display_name;
}

function showErrorAlert(msg) {
    $("#alert-msg").text(msg);
    $("#user-alert").show();
}

function hideErrorAlert() {
    $("#user-alert").hide();
}