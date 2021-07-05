const validator = require('validator') 
const userCollection = require('../db').db().collection('users')
const bcrypt = require('bcryptjs')
const md5 = require('md5')



let User= function(data,getAvatar){
    this.data =data
    this.errors =[]
    if(getAvatar==undefined){getAvatar=false}
    if(getAvatar){this.getAvatar()}
}

User.prototype.cleanUp =function(){
    if(typeof(this.data.username)!="string"){this.data.username=""}
    if(typeof(this.data.email)!="string"){this.data.email=""}
    if(typeof(this.data.password)!="string"){this.data.password=""}

    //clean up
    this.data={
        username: this.data.username.trim().toLowerCase(),
        email: this.data.email.trim().toLowerCase(),
        password: this.data.password
    }

}

User.prototype.validate =function(){
    return new Promise(async (resolve,reject)=>{
        if(this.data.username ==""){ this.errors.push("you must provide a valid user name")}
        if(this.data.username !=""&& !validator.isAlphanumeric(this.data.username)){this.errors.push("username should only contain alphabets and numbers")}
        if(!validator.isEmail(this.data.email)){this.errors.push("you must provide a valid email address")}
        if(this.data.password ==""){this.errors.push("you must provide a valid password") }
        if(this.data.password.length >0 && this.data.password.length<12){this.errors.push("password must be atleast 12 characters") }
        if(this.data.password.length >50){this.errors.push("password should not exceed 50 characters") }
        if(this.data.username.length >0 && this.data.username.length<3){this.errors.push("username must be atleast 3 characters") }
        if(this.data.username.length >30){this.errors.push("username should not exceed 30 characters") }
    
        //only if user enters valid username then check if it is already exists
        if( validator.isAlphanumeric(this.data.username)&&this.data.username.length >2 && this.data.username.length<31){
            let usernameExists =await userCollection.findOne({username:this.data.username})
            if(usernameExists){
                this.errors.push("that username is already taken")
            }
        }
    
        //only if user enters valid email then check if it is already exists
        if( validator.isEmail(this.data.email)){
            let emailExists =await userCollection.findOne({email:this.data.email})
            if(emailExists){
                this.errors.push("that email address is already taken")
            }
        }
        resolve()
    
    })
}

User.prototype.login =function(){
    return new Promise((resolve,reject)=>{
        this.cleanUp()
        userCollection.findOne({username:this.data.username}).then((attemptedUser)=>{
            if(attemptedUser&& bcrypt.compareSync(this.data.password,attemptedUser.password)){
                this.data= attemptedUser
                this.getAvatar()
                resolve("congrats!!")
            }
            else{
                reject("invalid username/password")
            }
        }).catch(function(){
            reject("please try again later")
        })
    })
}

User.prototype.register =function(){
    return new Promise(async (resolve,reject)=>{
        //step #1: validate user data
        this.cleanUp()
       await this.validate()
    
        //step #2 : only if no validation errors
        //then save user data to a data base
        if(!this.errors.length){
            let salt= bcrypt.genSaltSync(10)
            this.data.password = bcrypt.hashSync(this.data.password,salt)
            await userCollection.insertOne(this.data)
            userCollection.findOne({username:this.data.username}).then((userdetail)=>{
                this.data=userdetail
            }).catch(()=>{
                reject(this.errors)
            })
            this.getAvatar()
            resolve()
            
        }
        else{
            reject(this.errors)
        }
    
    })
}
User.prototype.getAvatar=function(){
    this.avatar=`https://gravatar.com/avatar/${md5(this.data.email)}?s=128`
}

User.findByUsername=function(username){
    return new Promise(function(resolve,reject){
        if(typeof(username)!='string'){
            reject()
            return
        }
        userCollection.findOne({username:username}).then(function(userDoc){
            if(userDoc){
                userDoc= new User(userDoc,true)
                userDoc= {
                    _id:userDoc.data._id,
                    username:userDoc.data.username,
                    avatar:userDoc.avatar
                }
                resolve(userDoc)
            }
            else{
                reject()
            }
        }).catch(function(){
            reject()
        })
    })
}

User.doesEmailExist =function(email){
    return new Promise(async function(resolve,reject){
        if(typeof(email)!='string'){
            resolve(false)
        }
        let user = await userCollection.findOne({email:email})
        if(user){
            resolve(true)
        }
        else{
            resolve(false)
        }
    })
}

module.exports =User