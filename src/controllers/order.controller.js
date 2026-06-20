import stripe from "../config/stripe.js";
import Cart from "../models/cart.model.js";
import Order from "../models/order.model.js";

// CREATE ORDER + STRIPE PAYMENT
export const createOrder = async (req, res) => {
  try {
    const { shippingAddress, paymentMethod } = req.body;

    console.log('📦 Creating order for user:', req.user._id);
    console.log('💳 Payment method:', paymentMethod);

    // Get user cart
    const cart = await Cart.findOne({
      user: req.user._id,
    });

    if (!cart || cart.items.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Cart is empty",
      });
    }

    console.log('🛒 Cart items:', cart.items.length);
    console.log('💰 Cart total:', cart.totalPrice);

    // Calculate totals
    const subtotal = cart.totalPrice;
    const deliveryFee = subtotal > 1000 ? 0 : 60;
    const tax = Math.round(subtotal * 0.05);
    const totalPrice = subtotal + deliveryFee + tax;

    console.log('💰 Total price:', totalPrice);

    let paymentIntent = null;
    let clientSecret = null;

    // CREATE STRIPE PAYMENT INTENT (ONLY FOR STRIPE)
    if (paymentMethod === "stripe") {
      try {
        // Convert to cents and ensure it's an integer
        const amountInCents = Math.round(totalPrice * 100);
        console.log('💰 Amount in cents:', amountInCents);

        // Validate Stripe key is set
        if (!process.env.STRIPE_SECRET_KEY) {
          throw new Error('STRIPE_SECRET_KEY is not set in environment variables');
        }

        // Create a new payment intent with more options
        paymentIntent = await stripe.paymentIntents.create({
          amount: amountInCents,
          currency: "usd",
          metadata: {
            userId: req.user._id.toString(),
            orderCreatedAt: new Date().toISOString(),
          },
          payment_method_types: ['card'],
          capture_method: 'automatic',
          confirmation_method: 'automatic',
        });

        clientSecret = paymentIntent.client_secret;
        
        console.log('✅ Stripe Payment Intent created successfully!');
        console.log('📝 Payment Intent ID:', paymentIntent.id);
        console.log('🔑 Client Secret:', clientSecret ? clientSecret.substring(0, 20) + '...' : 'null');

      } catch (stripeError) {
        console.error('❌ Stripe Error Details:', stripeError);
        console.error('❌ Stripe Error Message:', stripeError.message);
        console.error('❌ Stripe Error Type:', stripeError.type);
        
        // Return specific error for Stripe issues
        return res.status(400).json({
          success: false,
          message: `Payment initialization failed: ${stripeError.message}`,
          stripeError: stripeError.type || 'unknown',
        });
      }
    }

    // CREATE ORDER
    const orderData = {
      user: req.user._id,
      items: cart.items.map(item => ({
        product: item.product,
        name: item.name,
        image: item.image,
        price: item.price,
        quantity: item.quantity,
      })),
      shippingAddress,
      paymentMethod,
      paymentStatus: paymentMethod === "cash_on_delivery" ? "pending" : "pending",
      stripePaymentIntentId: paymentIntent?.id || "",
      totalItems: cart.totalItems,
      subtotal,
      deliveryFee,
      tax,
      totalPrice,
      orderStatus: "pending",
    };

    const order = await Order.create(orderData);
    console.log('✅ Order created successfully!');
    console.log('📝 Order ID:', order._id);

    // CLEAR CART
    cart.items = [];
    cart.totalItems = 0;
    cart.totalPrice = 0;
    await cart.save();

    // RESPONSE
    res.status(201).json({
      success: true,
      order,
      clientSecret: clientSecret || null,
    });

  } catch (error) {
    console.error('❌ Order Creation Error:', error);
    console.error('❌ Error Stack:', error.stack);
    
    res.status(500).json({
      success: false,
      message: error.message || "Failed to create order",
    });
  }
};

// GET LOGGED-IN USER ORDERS
export const getMyOrders = async (req, res) => {
  try {
    const orders = await Order.find({
      user: req.user._id,
    }).sort({
      createdAt: -1,
    });

    res.status(200).json({
      success: true,
      orders,
    });
  } catch (error) {
    console.error('❌ Get Orders Error:', error);
    res.status(500).json({
      message: error.message,
    });
  }
};

// GET SINGLE ORDER
export const getSingleOrder = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate("user")
      .populate("items.product");

    if (!order) {
      return res.status(404).json({
        message: "Order not found",
      });
    }

    res.status(200).json({
      success: true,
      order,
    });
  } catch (error) {
    console.error('❌ Get Single Order Error:', error);
    res.status(500).json({
      message: error.message,
    });
  }
};

// ADMIN: GET ALL ORDERS
export const getAllOrders = async (req, res) => {
  try {
    const orders = await Order.find()
      .populate("user")
      .sort({
        createdAt: -1,
      });

    res.status(200).json({
      success: true,
      count: orders.length,
      orders,
    });
  } catch (error) {
    console.error('❌ Get All Orders Error:', error);
    res.status(500).json({
      message: error.message,
    });
  }
};

// ADMIN: UPDATE ORDER STATUS
export const updateOrderStatus = async (req, res) => {
  try {
    const { orderStatus } = req.body;

    const order = await Order.findByIdAndUpdate(
      req.params.id,
      {
        orderStatus,
      },
      { new: true }
    );

    if (!order) {
      return res.status(404).json({
        message: "Order not found",
      });
    }

    res.status(200).json({
      success: true,
      order,
    });
  } catch (error) {
    console.error('❌ Update Order Status Error:', error);
    res.status(500).json({
      message: error.message,
    });
  }
};

// CANCEL ORDER
export const cancelOrder = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({
        message: "Order not found",
      });
    }

    // Check owner
    if (order.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        message: "Access denied",
      });
    }

    // Prevent cancel after delivery
    if (order.orderStatus === "delivered") {
      return res.status(400).json({
        message: "Delivered order cannot be cancelled",
      });
    }

    order.orderStatus = "cancelled";
    await order.save();

    res.status(200).json({
      success: true,
      message: "Order cancelled",
      order,
    });
  } catch (error) {
    console.error('❌ Cancel Order Error:', error);
    res.status(500).json({
      message: error.message,
    });
  }
};