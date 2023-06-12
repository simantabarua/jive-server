const express = require("express");
const cors = require("cors");
require("dotenv").config();
const app = express();
const dbUser = process.env.DB_USER;
const dbPass = process.env.DB_PASS;
const accessToken = process.env.TOKEN;

const jwt = require("jsonwebtoken");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const stripe = require("stripe")(process.env.PAYMENT_SECRET_KEY);
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
  if (email !== decodedEmail) {
    return res.status(403).send({ error: true, message: "Forbidden access" });
  }
};

async function run() {
  try {
    // Connect the client to the server (optional starting in v4.7)
    // await client.connect();
    const classesCollection = client.db("jive").collection("classes");
    const usersCollection = client.db("jive").collection("users");
    const paymentCollection = client.db("jive").collection("payment");
    const selectedClassCollection = client
      .db("jive")
      .collection("selectedClass");

    // Generate JWT
    app.post("/jwt", (req, res) => {
      const body = req.body;
      const token = jwt.sign(body, accessToken, { expiresIn: "1h" });
      res.send(token);
    });

    // Load approved classes
    app.get("/classes", async (req, res) => {
      const approvedClasses = await classesCollection
        .find({ classStatus: "approved" })
        .toArray();
      res.send(approvedClasses);
    });

    // Load popular classes
    app.get("/classes-popular", async (req, res) => {
      const popularClasses = await classesCollection
        .find({})
        .sort({ totalEnroll: -1 })
        .toArray();
      res.send(popularClasses);
    });

    // Load all classes
    app.get("/classes-all", verifyJWT, async (req, res) => {
      const email = req.query.email;
      const decodedEmail = req.decoded.email;
      checkAccess(email, decodedEmail, res);
      try {
        await checkAdmin(email);
        const approvedClasses = await classesCollection.find({}).toArray();
        res.send(approvedClasses);
      } catch (error) {
        console.error("Error occurred:", error);
        res.status(500).send({ error: true, message: "Internal server error" });
      }
    });
    //checkAdmin
    const checkAdmin = async (email) => {
      const query = { email: email, role: "admin" };
      const isAdmin = await usersCollection.findOne(query);
      if (!isAdmin) {
        return res
          .status(403)
          .send({ error: true, message: "Forbidden access" });
      }
      console.log(isAdmin);

      return isAdmin;
    };

    // Load all  instructors
    app.get("/instructors", async (req, res) => {
      const query = { role: "instructor" };
      const classes = await usersCollection.find(query).toArray();
      res.send(classes);
    });

    // Load popular   instructors
    app.get("/instructors-popular", async (req, res) => {
      const query = { role: "instructor" };
      const classes = await usersCollection
        .find(query)
        .sort({ totalStudents: -1 })
        .toArray();
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
      const decodedEmail = req.decoded.email;
      checkAccess(email, decodedEmail, res);
      try {
        await checkAdmin(email);
        const result = await usersCollection.find({}).toArray();
        res.send(result);
      } catch (error) {
        console.error("Error occurred:", error);
        res.status(500).send({ error: true, message: "Internal server error" });
      }
    });

    //load all orders
    app.get("/orders", verifyJWT, async (req, res) => {
      const email = req.query.email;
      const decodedEmail = req.decoded.email;
      checkAccess(email, decodedEmail, res);
      try {
        await checkAdmin(email);
        const result = await paymentCollection.find({}).toArray();
        res.send(result);
      } catch (error) {
        console.error("Error occurred:", error);
        res.status(500).send({ error: true, message: "Internal server error" });
      }
    });

    // change order status
    app.patch("/orders/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const order = req.body;
      const instructorEmail = order.instructorEmail;
      const email = order.email;
      const query = {
        _id: { $in: order.classesId.map((id) => new ObjectId(id)) },
      };
      const decodedEmail = req.decoded.email;

      try {
        await checkAdmin(email);
        checkAccess(email, decodedEmail, res);

        const filter = { _id: new ObjectId(id) };
        const updateDoc = {
          $set: {
            status: order.status,
          },
        };
        const updateClassDoc = {
          $inc: { availableSeats: -1, totalEnroll: 1 },
        };

        const insQuery = { email: { $in: instructorEmail } };
        const updateStudent = {
          $inc: { totalStudents: 1 },
        };

        await usersCollection.updateMany(insQuery, updateStudent);
        const updateClasses = await classesCollection.updateMany(
          query,
          updateClassDoc
        );
        const result = await paymentCollection.updateOne(filter, updateDoc);
        res.send(result);
      } catch (error) {
        console.error("Error occurred:", error);
        res.status(500).send({ error: true, message: "Internal server error" });
      }
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
      const email = req.body.email;
      const decodedEmail = req.decoded.email;
      checkAccess(email, decodedEmail, res);
      try {
        await checkAdmin(email);
        const filter = { _id: new ObjectId(id) };
        let updateDoc = {};

        if (req.body.role === "instructor") {
          updateDoc = {
            $set: {
              role: req.body.role,
              totalStudents: 0,
            },
          };
        } else {
          updateDoc = {
            $set: {
              role: req.body.role,
            },
          };
        }

        const result = await usersCollection.updateOne(filter, updateDoc);
        res.send(result);
      } catch (error) {
        console.error("Error occurred:", error);
        res.status(500).send({ error: true, message: "Internal server error" });
      }
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

    //load single class
    app.get("/class/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const classes = await classesCollection.findOne(query);
      res.send(classes);
    });

    // Get  classes by instructor
    app.get("/instructor-classes", verifyJWT, async (req, res) => {
      const email = req.query.email;
      const decodedEmail = req.decoded.email;
      checkAccess(email, decodedEmail, res);
      const query = { instructorEmail: email };
      const result = await classesCollection.find(query).toArray();
      res.send(result);
    });

    // Add class
    app.post("/add-class", verifyJWT, async (req, res) => {
      const newClass = req.body;
      const result = await classesCollection.insertOne(newClass);
      res.send(result);
    });

    //update Class
    app.patch("/update-class/:id", async (req, res) => {
      const newClass = req.body;
      const { className, availableSeats, image, price } = newClass;
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          className: className,
          availableSeats: availableSeats,
          image: image,
          price: price,
          classStatus: "pending",
        },
      };
      const result = await classesCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    // Change class status
    app.patch("/change-class/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const instructorEmail = req.body.instructorEmail;
      const query = { email: instructorEmail }; // Assuming the email field is named 'email' in the usersCollection

      const filter = { _id: new ObjectId(id) };
      const updateClassDoc = {
        $inc: { numberOfClasses: 1 },
      };
      const updateDoc = {
        $set: {
          classStatus: req.body.status,
        },
      };
      const updateInstructorClass = await usersCollection.updateOne(
        query,
        updateClassDoc
      );
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

    // Get enroll classes
    app.get("/enroll-class", verifyJWT, async (req, res) => {
      const email = req.query.email;
      const decodedEmail = req.decoded.email;
      checkAccess(email, decodedEmail, res);
      const query = { email: email };
      const result = await paymentCollection.find(query).toArray();
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

    // create payment intent
    app.post("/payment-intent", verifyJWT, async (req, res) => {
      const { price } = req.body;
      const amount = parseInt(price * 100);
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });

      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });

    app.post("/payments", verifyJWT, async (req, res) => {
      const payment = req.body;
      const insertResult = await paymentCollection.insertOne(payment);
      const query = {
        _id: { $in: payment.classesItems.map((id) => new ObjectId(id)) },
      };
      console.log("payment", payment);

      const deleteResult = await selectedClassCollection.deleteMany(query);
      res.send({ insertResult, deleteResult });
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
