const express = require("express");
const cors = require("cors");
require("dotenv").config();
const app = express();
const dbUser = process.env.DB_USER;
const dbPass = process.env.DB_PASS;
const accessToken = process.env.TOKEN;

const jwt = require("jsonwebtoken");
//port config
const port = process.env.PORT || 5000;
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

//middleware
app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${dbUser}:${dbPass}@cluster1.ycn4y5y.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});
const verifyJWT = (req, res, next) => {
  const authorization = req.headers.authorization;
  if (!authorization) {
    return res
      .status(401)
      .send({ error: true, message: "Unauthorized access" });
  }

  // check token
  const token = authorization.split(" ")[1];
  console.log(token);

  jwt.verify(token, accessToken, (err, decoded) => {
    if (err) {
      return res.status(403).send({ error: true, message: "Forbidden access" });
    }
    req.decoded = decoded;
    next();
  });
};
async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();
    const classesCollection = client.db("jive").collection("classes");
    const instructorCollection = client.db("jive").collection("instructor");
    const selectedClassCollection = client
      .db("jive")
      .collection("selectedClass");

    //generate jwt
    app.post("/jwt", (req, res) => {
      const body = req.body;
      const token = jwt.sign(body, accessToken, { expiresIn: "1h" });
      res.send(token);
    });

    //load all classes
    app.get("/classes", verifyJWT, async (req, res) => {
      const classes = await classesCollection.find({}).toArray();
      res.send(classes);
    });
    app.get("/instructors", async (req, res) => {
      const classes = await instructorCollection.find({}).toArray();
      res.send(classes);
    });

    // selected class
    app.post("/selected-class", async (req, res) => {
      const selectedCardData = req.body;
      console.log(selectedCardData);
      const result = await selectedClassCollection.insertOne(selectedCardData);
      res.send(result);
    });

    // get selected classes
    app.get("/selected-class",verifyJWT, async (req, res) => {
      const email = req.query.email;
      console.log(email);
      if (!email) {
        return res
          .status(401)
          .send({ error: true, message: "Unauthorized access" });
      }
      const decodeEmail = req.decoded.email;
      console.log(decodeEmail);
      
      if (email !== decodeEmail) {
        return res
          .status(401)
          .send({ error: true, message: "Forbidden access" });
      }
      const query = { email: email };
      const result = await selectedClassCollection.find(query).toArray();
      res.send(result);
    });
    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Jive server is running");
});

app.listen(port, () => {
  console.log(`Jive server is running on port ${port}`);
});
