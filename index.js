const express = require("express");
const cors = require("cors");
require("dotenv").config();
const app = express();
const dbUser = process.env.DB_USER;
const dbPass = process.env.DB_PASS;
const accessToken = process.env.TOKEN;

const jwt = require("jsonwebtoken");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

// Port config
const port = process.env.PORT || 5000;

// Middleware
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

// Middleware
const verifyJWT = (req, res, next) => {
  const authorization = req.headers.authorization;
  if (!authorization) {
    return res
      .status(401)
      .send({ error: true, message: "Unauthorized access" });
  }

  // Check token
  const token = authorization.split(" ")[1];
  jwt.verify(token, accessToken, (err, decoded) => {
    if (err) {
      return res.status(403).send({ error: true, message: "Forbidden access" });
    }
    req.decoded = decoded;
    next();
  });
};

//Check Access

const checkAccess = (email, decodedEmail, res) => {
  if (!email) {
    return res
      .status(401)
      .send({ error: true, message: "Unauthorized access" });
  }

  console.log(decodedEmail);

  if (email !== decodedEmail) {
    return res.status(403).send({ error: true, message: "Forbidden access" });
  }
};

async function run() {
  try {
    // Connect the client to the server (optional starting in v4.7)
    // await client.connect();
    const classesCollection = client.db("jive").collection("classes");
    const instructorCollection = client.db("jive").collection("instructor");
    const usersCollection = client.db("jive").collection("users");
    const selectedClassCollection = client
      .db("jive")
      .collection("selectedClass");

    // Generate JWT
    app.post("/jwt", (req, res) => {
      const body = req.body;
      const token = jwt.sign(body, accessToken, { expiresIn: "1h" });
      res.send(token);
    });

    // Load all classes
    app.get("/classes", async (req, res) => {
      const classes = await classesCollection.find({}).toArray();
      res.send(classes);
    });

    // Load all  instructors
    app.get("/instructors", async (req, res) => {
      const classes = await instructorCollection.find({}).toArray();
      res.send(classes);
    });

    // ---------------------------------- Manage user start -------------------------------//

    // Create user
    app.post("/users", async (req, res) => {
      const user = req.body;
      const query = { email: user.email };
      const isUserExist = await usersCollection.findOne(query);
      console.log("is", isUserExist);
      if (isUserExist) {
        return res.send("user exist");
      }
      const result = await usersCollection.insertOne(user);
      res.send(result);
    });

    // Get all users by admin
    app.get("/users", verifyJWT, async (req, res) => {
      const email = req.query.email;
      const query = { email: email, role: "admin" };
      const isAdmin = await usersCollection.findOne(query);
      const decodedEmail = req.decoded.email;
      checkAccess(email, decodedEmail, res);

      if (!isAdmin) {
        return res
          .status(403)
          .send({ error: true, message: "Forbidden access" });
      }
      const result = await usersCollection.find({}).toArray();
      res.send(result);
    });

    // Check user
    app.get("/check-user", verifyJWT, async (req, res) => {
      const email = req.query.email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      res.send(user.role);
    });

    // Change user role
    app.patch("/change-user-role/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          role: req.body.role,
        },
      };
      const result = await usersCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    // Delete user
    app.delete("/delete-user/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const result = await usersCollection.deleteOne(filter);
      res.send(result);
    });

    // ---------------------------------- Manage user end -------------------------------//

    // ---------------------------------- Manage Classes -------------------------------//

    // Get  classes by instructor
    app.get("/instructor-classes", verifyJWT, async (req, res) => {
      const email = req.query.email;
      const decodedEmail = req.decoded.email;
      checkAccess(email, decodedEmail, res);
      const query = { email: email };
      const result = await classesCollection.find(query).toArray();
      res.send(result);
    });

    // Add class
    app.post("/add-class", verifyJWT, async (req, res) => {
      const newClass = req.body;
      const result = await classesCollection.insertOne(newClass);
      res.send(result);
    });

    // Change class status
    app.patch("/change-class/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          classStatus: req.body.status,
        },
      };
      const result = await classesCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    //load  selected class
    app.post("/selected-class", verifyJWT, async (req, res) => {
      const selectedCardData = req.body;
      console.log(selectedCardData);
      const result = await selectedClassCollection.insertOne(selectedCardData);
      res.send(result);
    });

    // Get selected classes
    app.get("/selected-class", verifyJWT, async (req, res) => {
      const email = req.query.email;
      const decodedEmail = req.decoded.email;
      checkAccess(email, decodedEmail, res);
      const query = { email: email };
      const result = await selectedClassCollection.find(query).toArray();
      res.send(result);
    });

    // Delete class form selected class : student
    app.delete("/selected-class/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await selectedClassCollection.deleteOne(query);
      res.send(result);
    });

    // Delete class for db : admin/instructor
    app.delete("/delete-class/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await classesCollection.deleteOne(query);
      res.send(result);
    });

    // ---------------------------------- Manage Classes end -------------------------------//

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
