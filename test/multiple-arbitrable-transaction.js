/* eslint-disable no-undef */ // Avoid the linter considering truffle elements as undef.
const {
  expectThrow
} = require('openzeppelin-solidity/test/helpers/expectThrow')
const {
  increaseTime
} = require('openzeppelin-solidity/test/helpers/increaseTime')

const MultipleArbitrableTransaction = artifacts.require(
  './MultipleArbitrableTransaction.sol'
)
const CentralizedArbitrator = artifacts.require('./CentralizedArbitrator.sol')

contract('MultipleArbitrableTransaction', function(accounts) {
  const payer = accounts[0]
  const payee = accounts[1]
  const arbitrator = accounts[2]
  const other = accounts[3]
  const amount = 1000
  const feeTimeout = 100
  const timeoutPayment = 100
  const timeout = 100 // TODO must remove it
  const arbitrationFee = 20
  const gasPrice = 5000000000
  const metaEvidenceUri = 'https://kleros.io'

  /**
   * Getter for the last transaction
   * @param {MultipleArbitrableTransaction} multipleContract Multiple arbitrable transaction instance.
   * @param {function} callback The callback.
   * @returns {function} The last transaction.
   */
  async function getLastTransaction(multipleContract, callback) {
    const metaEvidenceEvent = multipleContract.MetaEvidence()
    const awaitable = new Promise((resolve, reject) => {
      const _handler = metaEvidenceEvent.watch((error, result) => {
        metaEvidenceEvent.stopWatching()
        if (!error) resolve(result)
        else reject(error)
      })
    })
    await callback()
    return awaitable
  }

  it('Should handle 1 transaction', async () => {
    const multipleContract = await MultipleArbitrableTransaction.new(
      0x0,
      0x0,
      feeTimeout,
      { from: payer }
    )
    const lastTransaction = await getLastTransaction(
      multipleContract,
      async () => {
        await multipleContract.createTransaction(
          timeoutPayment,
          payee,
          metaEvidenceUri,
          { from: payer, value: amount }
        )
      }
    )

    const arbitrableTransactionId = lastTransaction.args._metaEvidenceID.toNumber()
    const payerBalanceBeforeReimbursment = web3.eth.getBalance(payer)
    await multipleContract.reimburse(arbitrableTransactionId, 1000, {
      from: payee
    })
    const newPayerBalance = web3.eth.getBalance(payer)
    const newContractBalance = web3.eth.getBalance(multipleContract.address)
    const newAmount = (await multipleContract.transactions(
      arbitrableTransactionId
    ))[2]

    assert.equal(
      newPayerBalance.toString(),
      payerBalanceBeforeReimbursment.plus(1000).toString(),
      'The payer has not been reimbursed correctly'
    )
    assert.equal(newContractBalance.toNumber(), 0, 'Bad amount in the contract')
    assert.equal(newAmount.toNumber(), 0, 'Amount not updated correctly')
  })

  it('Should handle 3 transaction', async () => {
    const multipleContract = await MultipleArbitrableTransaction.new(
      0x0,
      0x0,
      feeTimeout,
      { from: payer }
    )
    for (var cnt = 0; cnt < 3; cnt += 1) {
      const lastTransaction = await getLastTransaction(
        multipleContract,
        async () => {
          await multipleContract.createTransaction(
            timeoutPayment,
            payee,
            metaEvidenceUri,
            { from: payer, value: amount }
          )
        }
      )

      const arbitrableTransactionId = lastTransaction.args._metaEvidenceID.toNumber()

      const payerBalanceBeforeReimbursment = web3.eth.getBalance(payer)
      await multipleContract.reimburse(arbitrableTransactionId, 1000, {
        from: payee
      })
      const newPayerBalance = web3.eth.getBalance(payer)
      const newContractBalance = web3.eth.getBalance(multipleContract.address)
      const newAmount = (await multipleContract.transactions(
        arbitrableTransactionId
      ))[2]

      assert.equal(
        newPayerBalance.toString(),
        payerBalanceBeforeReimbursment.plus(1000).toString(),
        'The payer has not been reimbursed correctly'
      )
      assert.equal(
        newContractBalance.toNumber(),
        0,
        'Bad amount in the contract'
      )
      assert.equal(newAmount.toNumber(), 0, 'Amount not updated correctly')
    }
  })

  it('Should put 1000 wei in the contract', async () => {
    const multipleContract = await MultipleArbitrableTransaction.new(
      0x0,
      0x0,
      feeTimeout,
      { from: payer }
    )
    const lastTransaction = await getLastTransaction(
      multipleContract,
      async () => {
        await multipleContract.createTransaction(
          timeoutPayment,
          payee,
          metaEvidenceUri,
          { from: payer, value: amount }
        )
      }
    )

    const arbitrableTransactionId = lastTransaction.args._metaEvidenceID.toNumber()

    assert.equal(
      web3.eth.getBalance(multipleContract.address),
      1000,
      "The contract hasn't received the wei correctly."
    )
    const amountSending = (await multipleContract.transactions(
      arbitrableTransactionId
    ))[2]

    assert.equal(
      amountSending.toNumber(),
      1000,
      "The contract hasn't updated its amount correctly."
    )
  })

  // Pay
  it('The payee should withdraw', async () => {
    const initialPayeeBalance = web3.eth.getBalance(payee)
    const multipleContract = await MultipleArbitrableTransaction.new(
      0x0,
      0x0,
      feeTimeout,
      { from: payer }
    )

    const lastTransaction = await getLastTransaction(
      multipleContract,
      async () => {
        await multipleContract.createTransaction(
          timeoutPayment,
          payee,
          metaEvidenceUri,
          { from: payer, value: amount }
        )
      }
    )

    const arbitrableTransactionId = lastTransaction.args._metaEvidenceID.toNumber()

    await increaseTime(timeoutPayment + 1)

    const tx = await multipleContract.executeTransaction(
      arbitrableTransactionId,
      {
        from: payee
      }
    )

    const consumed = tx.receipt.gasUsed * 100000000000
    const newPayeeBalance = web3.eth.getBalance(payee)
    assert.equal(
      newPayeeBalance.toString(),
      initialPayeeBalance.plus(1000 - consumed).toString(),
      "The payee hasn't been paid properly"
    )
  })

  it('The payer should not withdraw', async () => {
    const multipleContract = await MultipleArbitrableTransaction.new(
      0x0,
      0x0,
      feeTimeout,
      { from: payer }
    )
    const lastTransaction = await getLastTransaction(
      multipleContract,
      async () => {
        await multipleContract.createTransaction(
          timeoutPayment,
          payee,
          metaEvidenceUri,
          { from: payer, value: amount }
        )
      }
    )
    const arbitrableTransactionId = lastTransaction.args._metaEvidenceID.toNumber()
    await expectThrow(
      multipleContract.executeTransaction(arbitrableTransactionId, {
        from: payer
      })
    )
  })

  // Reimburse
  it('Should reimburse 507 to the payer', async () => {
    const multipleContract = await MultipleArbitrableTransaction.new(
      0x0,
      0x0,
      0,
      { from: payer }
    )
    const lastTransaction = await getLastTransaction(
      multipleContract,
      async () => {
        await multipleContract.createTransaction(
          timeoutPayment,
          payee,
          metaEvidenceUri,
          { from: payer, value: amount }
        )
      }
    )
    const arbitrableTransactionId = lastTransaction.args._metaEvidenceID.toNumber()

    const payerBalanceBeforeReimbursment = web3.eth.getBalance(payer)
    await multipleContract.reimburse(arbitrableTransactionId, 507, {
      from: payee
    })
    const newPayerBalance = web3.eth.getBalance(payer)
    const newContractBalance = web3.eth.getBalance(multipleContract.address)
    const newAmount = (await multipleContract.transactions(
      arbitrableTransactionId
    ))[2]

    assert.equal(
      newPayerBalance.toString(),
      payerBalanceBeforeReimbursment.plus(507).toString(),
      'The payer has not been reimbursed correctly'
    )
    assert.equal(
      newContractBalance.toNumber(),
      493,
      'Bad amount in the contract'
    )
    assert.equal(newAmount.toNumber(), 493, 'Amount not updated correctly')
  })

  it('Should reimburse 1000 (all) to the payer', async () => {
    const multipleContract = await MultipleArbitrableTransaction.new(
      0x0,
      0x0,
      0,
      { from: payer }
    )

    const lastTransaction = await getLastTransaction(
      multipleContract,
      async () => {
        await multipleContract.createTransaction(
          timeoutPayment,
          payee,
          metaEvidenceUri,
          { from: payer, value: amount }
        )
      }
    )
    const arbitrableTransactionId = lastTransaction.args._metaEvidenceID.toNumber()

    const payerBalanceBeforeReimbursment = web3.eth.getBalance(payer)
    await multipleContract.reimburse(arbitrableTransactionId, 1000, {
      from: payee
    })
    const newPayerBalance = web3.eth.getBalance(payer)
    const newContractBalance = web3.eth.getBalance(multipleContract.address)
    const newAmount = (await multipleContract.transactions(
      arbitrableTransactionId
    ))[2]

    assert.equal(
      newPayerBalance.toString(),
      payerBalanceBeforeReimbursment.plus(1000).toString(),
      'The payer has not been reimbursed correctly'
    )
    assert.equal(newContractBalance.toNumber(), 0, 'Bad amount in the contract')
    assert.equal(newAmount.toNumber(), 0, 'Amount not updated correctly')
  })

  it('Should fail if we try to reimburse more', async () => {
    const multipleContract = await MultipleArbitrableTransaction.new(
      0x0,
      0x0,
      0,
      { from: payer }
    )

    const lastTransaction = await getLastTransaction(
      multipleContract,
      async () => {
        await multipleContract.createTransaction(
          timeoutPayment,
          payee,
          metaEvidenceUri,
          { from: payer, value: amount }
        )
      }
    )
    const arbitrableTransactionId = lastTransaction.args._metaEvidenceID.toNumber()

    await expectThrow(
      multipleContract.reimburse(arbitrableTransactionId, 1003, { from: payee })
    )
  })

  it('Should fail if the payer to tries to reimburse it', async () => {
    const multipleContract = await MultipleArbitrableTransaction.new(
      0x0,
      0x0,
      0,
      { from: payer }
    )

    const lastTransaction = await getLastTransaction(
      multipleContract,
      async () => {
        await multipleContract.createTransaction(
          timeoutPayment,
          payee,
          metaEvidenceUri,
          { from: payer, value: amount }
        )
      }
    )
    const arbitrableTransactionId = lastTransaction.args._metaEvidenceID.toNumber()

    await expectThrow(
      multipleContract.reimburse(arbitrableTransactionId, 1000, { from: payer })
    )
  })

  // executeRuling
  it('Should reimburse the payer (including arbitration fee) when the arbitrator decides so', async () => {
    const centralizedArbitrator = await CentralizedArbitrator.new(
      arbitrationFee,
      { from: arbitrator }
    )

    const multipleContract = await MultipleArbitrableTransaction.new(
      centralizedArbitrator.address,
      0x0,
      0,
      { from: payer }
    )

    const lastTransaction = await getLastTransaction(
      multipleContract,
      async () => {
        await multipleContract.createTransaction(
          timeoutPayment,
          payee,
          metaEvidenceUri,
          { from: payer, value: amount }
        )
      }
    )
    const arbitrableTransactionId = lastTransaction.args._metaEvidenceID.toNumber()

    await multipleContract.payArbitrationFeeBySender(arbitrableTransactionId, {
      from: payee,
      value: arbitrationFee
    })
    await multipleContract.payArbitrationFeeByReceiver(
      arbitrableTransactionId,
      {
        from: payer,
        value: arbitrationFee
      }
    )
    const payerBalanceBeforeReimbursment = web3.eth.getBalance(payer)
    await centralizedArbitrator.giveRuling(0, 1, { from: arbitrator })
    const newPayerBalance = web3.eth.getBalance(payer)
    assert.equal(
      newPayerBalance.toString(),
      payerBalanceBeforeReimbursment.plus(1020).toString(),
      'The payer has not been reimbursed correctly'
    )
  })

  it('Should pay the payee and reimburse him the arbitration fee when the arbitrator decides so', async () => {
    const centralizedArbitrator = await CentralizedArbitrator.new(
      arbitrationFee,
      { from: arbitrator }
    )
    const multipleContract = await MultipleArbitrableTransaction.new(
      centralizedArbitrator.address,
      0x0,
      0,
      { from: payer }
    )

    const lastTransaction = await getLastTransaction(
      multipleContract,
      async () => {
        await multipleContract.createTransaction(
          timeoutPayment,
          payee,
          metaEvidenceUri,
          { from: payer, value: amount }
        )
      }
    )
    const arbitrableTransactionId = lastTransaction.args._metaEvidenceID.toNumber()

    await multipleContract.payArbitrationFeeByReceiver(
      arbitrableTransactionId,
      {
        from: payer,
        value: arbitrationFee
      }
    )
    await multipleContract.payArbitrationFeeBySender(arbitrableTransactionId, {
      from: payee,
      value: arbitrationFee
    })
    const payeeBalanceBeforePay = web3.eth.getBalance(payee)
    await centralizedArbitrator.giveRuling(0, 2, { from: arbitrator })
    const newPayeeBalance = web3.eth.getBalance(payee)
    assert.equal(
      newPayeeBalance.toString(),
      payeeBalanceBeforePay.plus(1020).toString(),
      'The payee has not been paid properly'
    )
  })

  it('Should split the amount if there is no ruling', async () => {
    const centralizedArbitrator = await CentralizedArbitrator.new(
      arbitrationFee,
      { from: arbitrator }
    )
    const multipleContract = await MultipleArbitrableTransaction.new(
      centralizedArbitrator.address,
      0x0,
      0,
      { from: payer }
    )

    const lastTransaction = await getLastTransaction(
      multipleContract,
      async () => {
        await multipleContract.createTransaction(
          timeoutPayment,
          payee,
          metaEvidenceUri,
          { from: payer, value: amount }
        )
      }
    )
    const arbitrableTransactionId = lastTransaction.args._metaEvidenceID.toNumber()

    await multipleContract.payArbitrationFeeByReceiver(
      arbitrableTransactionId,
      {
        from: payer,
        value: arbitrationFee
      }
    )
    await multipleContract.payArbitrationFeeBySender(arbitrableTransactionId, {
      from: payee,
      value: arbitrationFee
    })
    const payerBalanceBeforeRuling = web3.eth.getBalance(payer)
    const payeeBalanceBeforeRuling = web3.eth.getBalance(payee)

    await centralizedArbitrator.giveRuling(0, 0, { from: arbitrator })

    const payerBalanceAfterRuling = web3.eth.getBalance(payer)
    const payeeBalanceAfterRuling = web3.eth.getBalance(payee)

    assert.equal(
      payeeBalanceAfterRuling.toString(),
      payeeBalanceBeforeRuling.plus(510).toString(),
      'The payee has not been reimbursed correctly'
    )

    assert.equal(
      payerBalanceAfterRuling.toString(),
      payerBalanceBeforeRuling.plus(510).toString(),
      'The payer has not been paid properly'
    )
  })

  it('Should refund overpaid arbitration fee for payer', async () => {
    const centralizedArbitrator = await CentralizedArbitrator.new(
      arbitrationFee,
      { from: arbitrator }
    )
    const multipleContract = await MultipleArbitrableTransaction.new(
      centralizedArbitrator.address,
      0x0,
      0,
      { from: payer }
    )

    const lastTransaction = await getLastTransaction(
      multipleContract,
      async () => {
        await multipleContract.createTransaction(
          timeoutPayment,
          payee,
          metaEvidenceUri,
          { from: payer, value: amount }
        )
      }
    )
    const arbitrableTransactionId = lastTransaction.args._metaEvidenceID.toNumber()

    const extraAmount = 100
    await multipleContract.payArbitrationFeeByReceiver(
      arbitrableTransactionId,
      {
        from: payer,
        value: arbitrationFee + extraAmount
      }
    )
    await multipleContract.payArbitrationFeeBySender(arbitrableTransactionId, {
      from: payee,
      value: arbitrationFee
    })
    const payerBalanceBeforePay = web3.eth.getBalance(payer)
    await centralizedArbitrator.giveRuling(0, 2, { from: arbitrator })
    const newPayerBalance = web3.eth.getBalance(payer)
    assert.equal(
      newPayerBalance.toString(),
      payerBalanceBeforePay.plus(0).toString(),
      'The payer was not refunded properly'
    )
  })

  it('Should change status to WaitingReceiver after the arbitration cost increase', async () => {
    const centralizedArbitrator = await CentralizedArbitrator.new(
      arbitrationFee,
      { from: arbitrator }
    )
    const multipleContract = await MultipleArbitrableTransaction.new(
      centralizedArbitrator.address,
      0x0,
      0,
      { from: payer }
    )

    const lastTransaction = await getLastTransaction(
      multipleContract,
      async () => {
        await multipleContract.createTransaction(
          timeoutPayment,
          payee,
          metaEvidenceUri,
          { from: payer, value: amount }
        )
      }
    )

    const arbitrableTransactionId = lastTransaction.args._metaEvidenceID.toNumber()

    await multipleContract.payArbitrationFeeByReceiver(
      arbitrableTransactionId,
      {
        from: payer,
        value: arbitrationFee
      }
    )

    arbitrableTransactionStatus = (await multipleContract.transactions(
      arbitrableTransactionId
    ))[8]

    assert.equal(
      arbitrableTransactionStatus.toNumber(),
      1, // `Status.WaitingSender == 1`
      'The transaction did not change correctly to new status: `Status.WaitingSender`'
    )

    await centralizedArbitrator.setArbitrationPrice(arbitrationFee + 42, {
      from: arbitrator
    })

    await multipleContract.payArbitrationFeeBySender(arbitrableTransactionId, {
      from: payee,
      value: arbitrationFee + 42
    })

    arbitrableTransactionStatus = (await multipleContract.transactions(
      arbitrableTransactionId
    ))[8]

    assert.equal(
      arbitrableTransactionStatus.toNumber(),
      2, // `Status.WaitingReceiver == 2`
      'The transaction did not change correctly to new status: `Status.WaitingReceiver`'
    )
  })

  it('Should split correclty the arbitration cost after the arbitration cost increase', async () => {
    const centralizedArbitrator = await CentralizedArbitrator.new(
      arbitrationFee,
      { from: arbitrator }
    )
    const multipleContract = await MultipleArbitrableTransaction.new(
      centralizedArbitrator.address,
      0x0,
      0,
      { from: payer }
    )

    const lastTransaction = await getLastTransaction(
      multipleContract,
      async () => {
        await multipleContract.createTransaction(
          timeoutPayment,
          payee,
          metaEvidenceUri,
          { from: payer, value: amount }
        )
      }
    )

    const arbitrableTransactionId = lastTransaction.args._metaEvidenceID.toNumber()

    await multipleContract.payArbitrationFeeByReceiver(
      arbitrableTransactionId,
      {
        from: payer,
        value: arbitrationFee
      }
    )

    await centralizedArbitrator.setArbitrationPrice(arbitrationFee + 42, {
      from: arbitrator
    })

    await multipleContract.payArbitrationFeeBySender(arbitrableTransactionId, {
      from: payee,
      value: arbitrationFee + 42
    })

    await multipleContract.payArbitrationFeeByReceiver(
      arbitrableTransactionId,
      {
        from: payer,
        value: 42 + 10 // Pay the rest of arbitration fee with an extra to test also the refund in this case
      }
    )

    const payerBalanceBeforeRuling = web3.eth.getBalance(payer)
    const payeeBalanceBeforeRuling = web3.eth.getBalance(payee)

    await centralizedArbitrator.giveRuling(0, 0, { from: arbitrator })

    const payerBalanceAfterRuling = web3.eth.getBalance(payer)
    const payeeBalanceAfterRuling = web3.eth.getBalance(payee)

    assert.equal(
      payeeBalanceAfterRuling.toString(),
      payeeBalanceBeforeRuling
        .plus(510)
        .plus(21)
        .toString(),
      'The payee has not been reimbursed correctly'
    )

    assert.equal(
      payerBalanceAfterRuling.toString(),
      payerBalanceBeforeRuling
        .plus(510)
        .plus(21)
        .toString(),
      'The payer has not been paid properly'
    )

    // check also the contract balance
    assert.equal(
      web3.eth.getBalance(multipleContract.address),
      0,
      'The ETH amount in the contract is not 0'
    )
  })

  it('Should reimburse the payer in case of timeout of the payee', async () => {
    const centralizedArbitrator = await CentralizedArbitrator.new(
      arbitrationFee,
      { from: arbitrator }
    )

    const multipleContract = await MultipleArbitrableTransaction.new(
      centralizedArbitrator.address,
      0x0,
      0,
      { from: payer }
    )

    const lastTransaction = await getLastTransaction(
      multipleContract,
      async () => {
        await multipleContract.createTransaction(
          timeoutPayment,
          payee,
          metaEvidenceUri,
          { from: payer, value: amount }
        )
      }
    )
    const arbitrableTransactionId = lastTransaction.args._metaEvidenceID.toNumber()

    await multipleContract.payArbitrationFeeByReceiver(
      arbitrableTransactionId,
      {
        from: payer,
        value: arbitrationFee
      }
    )
    await increaseTime(timeout + 1)
    const payerBalanceBeforeReimbursment = web3.eth.getBalance(payer)
    const tx = await multipleContract.timeOutByReceiver(
      arbitrableTransactionId,
      {
        from: payer,
        gasPrice: gasPrice
      }
    )
    const txFee = tx.receipt.gasUsed * gasPrice
    const newPayerBalance = web3.eth.getBalance(payer)
    assert.equal(
      newPayerBalance.toString(),
      payerBalanceBeforeReimbursment
        .plus(1020)
        .minus(txFee)
        .toString(),
      'The payer has not been reimbursed correctly'
    )
  })

  it("Shouldn't work before timeout for the payer", async () => {
    const centralizedArbitrator = await CentralizedArbitrator.new(
      arbitrationFee,
      { from: arbitrator }
    )

    const multipleContract = await MultipleArbitrableTransaction.new(
      centralizedArbitrator.address,
      0x0,
      feeTimeout,
      { from: payer }
    )

    const lastTransaction = await getLastTransaction(
      multipleContract,
      async () => {
        await multipleContract.createTransaction(
          timeoutPayment,
          payee,
          metaEvidenceUri,
          { from: payer, value: amount }
        )
      }
    )
    const arbitrableTransactionId = lastTransaction.args._metaEvidenceID.toNumber()

    await expectThrow(
      multipleContract.timeOutByReceiver(arbitrableTransactionId, {
        from: payer,
        gasPrice: gasPrice
      })
    )
    await multipleContract.payArbitrationFeeByReceiver(
      arbitrableTransactionId,
      {
        from: payer,
        value: arbitrationFee
      }
    )
    await increaseTime(1)
    await expectThrow(
      multipleContract.timeOutByReceiver(arbitrableTransactionId, {
        from: payer,
        gasPrice: gasPrice
      })
    )
  })

  it('Should pay and reimburse the payee in case of timeout of the payer', async () => {
    const centralizedArbitrator = await CentralizedArbitrator.new(
      arbitrationFee,
      { from: arbitrator }
    )

    const multipleContract = await MultipleArbitrableTransaction.new(
      centralizedArbitrator.address,
      0x0,
      feeTimeout,
      { from: payer }
    )

    const lastTransaction = await getLastTransaction(
      multipleContract,
      async () => {
        await multipleContract.createTransaction(
          timeoutPayment,
          payee,
          metaEvidenceUri,
          { from: payer, value: amount }
        )
      }
    )
    const arbitrableTransactionId = lastTransaction.args._metaEvidenceID.toNumber()

    await multipleContract.payArbitrationFeeBySender(arbitrableTransactionId, {
      from: payee,
      value: arbitrationFee
    })
    await increaseTime(feeTimeout + 1)
    const payeeBalanceBeforeReimbursment = web3.eth.getBalance(payee)
    const tx = await multipleContract.timeOutBySender(arbitrableTransactionId, {
      from: payee,
      gasPrice: gasPrice
    })
    const txFee = tx.receipt.gasUsed * gasPrice
    const newPayeeBalance = web3.eth.getBalance(payee)
    assert.equal(
      newPayeeBalance.toString(),
      payeeBalanceBeforeReimbursment
        .plus(1020)
        .minus(txFee)
        .toString(),
      'The payee has not been paid correctly'
    )
  })

  it("Shouldn't work before timeout for the payee", async () => {
    const centralizedArbitrator = await CentralizedArbitrator.new(
      arbitrationFee,
      { from: arbitrator }
    )

    const multipleContract = await MultipleArbitrableTransaction.new(
      centralizedArbitrator.address,
      0x0,
      feeTimeout,
      { from: payer }
    )

    const lastTransaction = await getLastTransaction(
      multipleContract,
      async () => {
        await multipleContract.createTransaction(
          timeoutPayment,
          payee,
          metaEvidenceUri,
          { from: payer, value: amount }
        )
      }
    )
    const arbitrableTransactionId = lastTransaction.args._metaEvidenceID.toNumber()

    await expectThrow(
      multipleContract.timeOutBySender(arbitrableTransactionId, {
        from: payee,
        gasPrice: gasPrice
      })
    )
    await multipleContract.payArbitrationFeeBySender(arbitrableTransactionId, {
      from: payee,
      value: arbitrationFee
    })
    await increaseTime(1)
    await expectThrow(
      multipleContract.timeOutBySender(arbitrableTransactionId, {
        from: payee,
        gasPrice: gasPrice
      })
    )
  })

  // submitEvidence
  it('Should create events when evidence is submitted by the payer', async () => {
    const centralizedArbitrator = await CentralizedArbitrator.new(
      arbitrationFee,
      { from: arbitrator }
    )

    const multipleContract = await MultipleArbitrableTransaction.new(
      centralizedArbitrator.address,
      0x0,
      feeTimeout,
      { from: payer }
    )

    const lastTransaction = await getLastTransaction(
      multipleContract,
      async () => {
        await multipleContract.createTransaction(
          timeoutPayment,
          payee,
          metaEvidenceUri,
          { from: payer, value: amount }
        )
      }
    )
    const arbitrableTransactionId = lastTransaction.args._metaEvidenceID.toNumber()

    await multipleContract.payArbitrationFeeByReceiver(
      arbitrableTransactionId,
      {
        from: payer,
        value: arbitrationFee
      }
    )
    await multipleContract.payArbitrationFeeBySender(arbitrableTransactionId, {
      from: payee,
      value: arbitrationFee
    })
    const tx = await multipleContract.submitEvidence(
      arbitrableTransactionId,
      'ipfs:/X',
      { from: payer }
    )
    assert.equal(tx.logs[0].event, 'Evidence')
    assert.equal(tx.logs[0].args._arbitrator, centralizedArbitrator.address)
    assert.equal(tx.logs[0].args._party, payer)
    assert.equal(tx.logs[0].args._evidence, 'ipfs:/X')
  })

  it('Should create events when evidence is submitted by the payee', async () => {
    const centralizedArbitrator = await CentralizedArbitrator.new(
      arbitrationFee,
      { from: arbitrator }
    )

    const multipleContract = await MultipleArbitrableTransaction.new(
      centralizedArbitrator.address,
      0x0,
      feeTimeout,
      { from: payer }
    )

    const lastTransaction = await getLastTransaction(
      multipleContract,
      async () => {
        await multipleContract.createTransaction(
          timeoutPayment,
          payee,
          metaEvidenceUri,
          { from: payer, value: amount }
        )
      }
    )
    const arbitrableTransactionId = lastTransaction.args._metaEvidenceID.toNumber()

    await multipleContract.payArbitrationFeeByReceiver(
      arbitrableTransactionId,
      {
        from: payer,
        value: arbitrationFee
      }
    )
    await multipleContract.payArbitrationFeeBySender(arbitrableTransactionId, {
      from: payee,
      value: arbitrationFee
    })
    const tx = await multipleContract.submitEvidence(
      arbitrableTransactionId,
      'ipfs:/X',
      { from: payee }
    )
    assert.equal(tx.logs[0].event, 'Evidence')
    assert.equal(tx.logs[0].args._arbitrator, centralizedArbitrator.address)
    assert.equal(tx.logs[0].args._party, payee)
    assert.equal(tx.logs[0].args._evidence, 'ipfs:/X')
  })

  it('Should fail if someone else try to submit', async () => {
    const centralizedArbitrator = await CentralizedArbitrator.new(
      arbitrationFee,
      { from: arbitrator }
    )

    const multipleContract = await MultipleArbitrableTransaction.new(
      centralizedArbitrator.address,
      0x0,
      feeTimeout,
      { from: payer }
    )

    const lastTransaction = await getLastTransaction(
      multipleContract,
      async () => {
        await multipleContract.createTransaction(
          timeoutPayment,
          payee,
          metaEvidenceUri,
          { from: payer, value: amount }
        )
      }
    )
    const arbitrableTransactionId = lastTransaction.args._metaEvidenceID.toNumber()

    await multipleContract.payArbitrationFeeByReceiver(
      arbitrableTransactionId,
      {
        from: payer,
        value: arbitrationFee
      }
    )
    await multipleContract.payArbitrationFeeBySender(arbitrableTransactionId, {
      from: payee,
      value: arbitrationFee
    })
    await expectThrow(
      multipleContract.submitEvidence(arbitrableTransactionId, 'ipfs:/X', {
        from: other
      })
    )
  })

  it('Should handle multiple transactions concurrently', async () => {
    const centralizedArbitrator = await CentralizedArbitrator.new(
      arbitrationFee,
      { from: arbitrator }
    )

    const multipleContract = await MultipleArbitrableTransaction.new(
      centralizedArbitrator.address,
      0x0,
      feeTimeout,
      { from: payer }
    )

    const metaEvidenceEvent = multipleContract.MetaEvidence()

    let currentResolve
    let lastTransactionEvent = -1
    metaEvidenceEvent.watch((_error, result) => {
      const eventTransaction = result.args._metaEvidenceID.toNumber()
      if (eventTransaction > lastTransactionEvent) {
        lastTransactionEvent = eventTransaction
        currentResolve(result)
      }
    })

    const transaction1Promise = new Promise(resolve => {
      currentResolve = resolve

      multipleContract.createTransaction(
        timeoutPayment,
        payee,
        metaEvidenceUri,
        { from: payer, value: amount }
      )
    })

    const lastTransaction = await transaction1Promise

    const arbitrableTransactionId1 = lastTransaction.args._metaEvidenceID.toNumber()

    const transaction2Promise = new Promise(resolve => {
      currentResolve = resolve

      multipleContract.createTransaction(
        timeoutPayment,
        payee,
        metaEvidenceUri,
        { from: payer, value: amount }
      )
    })

    const lastTransaction2 = await transaction2Promise

    const arbitrableTransactionId2 = lastTransaction2.args._metaEvidenceID.toNumber()

    metaEvidenceEvent.stopWatching()

    await multipleContract.payArbitrationFeeByReceiver(
      arbitrableTransactionId2,
      {
        from: payer,
        value: arbitrationFee
      }
    )
    await multipleContract.payArbitrationFeeBySender(arbitrableTransactionId1, {
      from: payee,
      value: arbitrationFee
    })
    // This generates transaction 1 dispute 0
    await multipleContract.payArbitrationFeeByReceiver(
      arbitrableTransactionId1,
      {
        from: payer,
        value: arbitrationFee
      }
    )
    // This generates transaction 2 dispute 1
    await multipleContract.payArbitrationFeeBySender(arbitrableTransactionId2, {
      from: payee,
      value: arbitrationFee
    })

    const payerBalanceBeforeReimbursment = web3.eth.getBalance(payer)
    // Ruling for transaction 1
    await centralizedArbitrator.giveRuling(0, 1, { from: arbitrator })
    const newPayerBalance = web3.eth.getBalance(payer)
    assert.equal(
      newPayerBalance.toString(),
      payerBalanceBeforeReimbursment.plus(1020).toString(),
      'The payer has not been reimbursed correctly'
    )

    const payeeBalanceBeforePay = web3.eth.getBalance(payee)
    // ruling for transaction 2
    await centralizedArbitrator.giveRuling(1, 2, { from: arbitrator })
    const newPayeeBalance = web3.eth.getBalance(payee)
    assert.equal(
      newPayeeBalance.toString(),
      payeeBalanceBeforePay.plus(1020).toString(),
      'The payee has not been paid properly'
    )
  })

  // FIXME
  // it('Should handle multiple transactions and arbitrators concurrently', async () => {
  //   const centralizedArbitrator1 = await CentralizedArbitrator.new(
  //     arbitrationFee,
  //     { from: arbitrator }
  //   )
  //   const centralizedArbitrator2 = await CentralizedArbitrator.new(
  //     arbitrationFee,
  //     { from: other }
  //   )

  //   const multipleContract1 = await MultipleArbitrableTransaction.new(
  //     centralizedArbitrator1.address,
  //     0x0,
  //     feeTimeout,
  //     { from: payer }
  //   )

  //   const metaEvidenceEvent = multipleContract1.MetaEvidence()

  //   let currentResolve
  //   let lastTransactionEvent = -1
  //   const _handler = metaEvidenceEvent.watch((_error, result) => {
  //     const eventTransaction = result.args._metaEvidenceID.toNumber()
  //     if (eventTransaction > lastTransactionEvent) {
  //       lastTransactionEvent = eventTransaction
  //       currentResolve(result)
  //     }
  //   })

  //   const transaction1Promise = new Promise(resolve => {
  //     currentResolve = resolve

  //     multipleContract1.createTransaction(
  //       timeoutPayment,
  //       payee,
  //       metaEvidenceUri,
  //       { from: payer, value: amount }
  //     )
  //   })

  //   const lastTransaction = await transaction1Promise

  //   const arbitrableTransactionId1 = lastTransaction.args._metaEvidenceID.toNumber()

  //   const multipleContract2 = await MultipleArbitrableTransaction.new(
  //     centralizedArbitrator2.address,
  //     0x0,
  //     feeTimeout,
  //     { from: payer }
  //   )

  //   const transaction2Promise = new Promise(resolve => {
  //     currentResolve = resolve

  //     multipleContract2.createTransaction(
  //       timeoutPayment,
  //       payee,
  //       metaEvidenceUri,
  //       { from: payer, value: amount }
  //     )
  //   })

  //   const lastTransaction2 = await transaction2Promise

  //   const arbitrableTransactionId2 = lastTransaction2.args._metaEvidenceID.toNumber()

  //   metaEvidenceEvent.stopWatching()

  //   await multipleContract1.payArbitrationFeeByReceiver(arbitrableTransactionId2, {
  //     from: payer,
  //     value: arbitrationFee
  //   })
  //   await multipleContract1.payArbitrationFeeBySender(arbitrableTransactionId1, {
  //     from: payee,
  //     value: arbitrationFee
  //   })
  //   // This generates transaction 1 dispute 0 from arbitrator 1
  //   await multipleContract2.payArbitrationFeeByReceiver(arbitrableTransactionId1, {
  //     from: payer,
  //     value: arbitrationFee
  //   })
  //   // This generates transaction 2 dispute 0 from arbitrator 2
  //   await multipleContract2.payArbitrationFeeBySender(arbitrableTransactionId2, {
  //     from: payee,
  //     value: arbitrationFee
  //   })

  //   const payerBalanceBeforeReimbursment = web3.eth.getBalance(payer)
  //   // Ruling for transaction 1
  //   await centralizedArbitrator1.giveRuling(0, 1, { from: arbitrator })
  //   const newPayerBalance = web3.eth.getBalance(payer)
  //   assert.equal(
  //     newPayerBalance.toString(),
  //     payerBalanceBeforeReimbursment.plus(1020).toString(),
  //     'The payer has not been reimbursed correctly'
  //   )

  //   const payeeBalanceBeforePay = web3.eth.getBalance(payee)
  //   // ruling for transaction 2
  //   await centralizedArbitrator2.giveRuling(0, 2, { from: other })
  //   const newPayeeBalance = web3.eth.getBalance(payee)
  //   assert.equal(
  //     newPayeeBalance.toString(),
  //     payeeBalanceBeforePay.plus(1020).toString(),
  //     'The payee has not been paid properly'
  //   )
  // })
})
