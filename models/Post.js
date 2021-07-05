
const User = require('./User')
const sanitizeHTML=require('sanitize-html')
const postCollection = require('../db').db().collection('posts')
const followCollection = require('../db').db().collection('follows')
const ObjectId =require('mongodb').ObjectID

let Post= function(data,userid,postId){
    this.data =data
    this.errors=[]
    this.userid=userid
    this.postId =postId
}

Post.prototype.cleanUp =function(){
    if(typeof(this.data.title)!="string"){this.data.title=""}
    if(typeof(this.data.body)!="string"){this.data.body=""}

    //get rid of bogus properties
    this.data={
        title: sanitizeHTML(this.data.title.trim(),{allowedTags:[],allowedAttributes:{}}),
        body:sanitizeHTML(this.data.body.trim(),{allowedTags:[],allowedAttributes:{}}),
        createdDate: new Date(),
        author: new ObjectId(this.userid)
    }
}

Post.prototype.validate =function(){
    if(this.data.title==""){this.data.errors.push("you must provide a title")}
    if(this.data.body==""){this.data.errors.push("you must provide a body")}
}

Post.prototype.create =function(){
    return new Promise((resolve,reject)=>{
        this.cleanUp()
        this.validate()
        if(!this.errors.length){
           postCollection.insertOne(this.data).then((info)=>{
               resolve(info.ops[0]._id)
           }).catch(()=>{
                this.errors.push("please try again later")
                reject(this.errors)
           })
           
        }
        else{
            reject(this.errors)
        }
    })
}

Post.prototype.update=function(){
    return new Promise(async (resolve,reject)=>{
        try{
            let post= await Post.findSingleById(this.postId,this.userid) 
            
            if(post.isVisitorOwner){
                //actually update db
                let status=await this.actuallyUpdate()
                resolve(status)
            }
            else{
                reject()
            }
        }catch{
           
            reject()
        }
    })
}

Post.prototype.actuallyUpdate=function(){
    return new Promise(async (resolve,reject)=>{
        this.cleanUp()
        this.validate()
        if(!this.errors.length){
            await postCollection.findOneAndUpdate({_id : new ObjectId(this.postId)},{$set:{title:this.data.title,body:this.data.body}})
            resolve('success')
        }
        else{
            resolve('failure')
        }

    })
}

Post.reusablePostQuery =function(uniqueOperations,visitorId){
    return new Promise(async (resolve,reject)=>{
        let aggOperations= uniqueOperations.concat([
            
            {$lookup: {from: 'users',localField:'author',foreignField:'_id',as:'authorDocument'}},
            {$project:{
                title:1,
                body:1,
                createdDate:1,
                authorId: "$author",
                author:{$arrayElemAt:["$authorDocument",0]}
            }}
        ])
        let posts = await postCollection.aggregate(aggOperations).toArray()

        //clean up author to contain only name and avatar
        posts.map(function(post){
            post.isVisitorOwner= post.authorId.equals(visitorId)
            post.authorId=undefined
            post.author = {
                username:post.author.username,
                avatar: new User(post.author,true).avatar
            }
            return post
        })

        resolve(posts)
    })
}


Post.findSingleById =function(id,visitorId){
    
    return new Promise(async (resolve,reject)=>{
        if(typeof(id)!="string"||!ObjectId.isValid(id)){
            
            reject()
            return
        }
        let posts = await Post.reusablePostQuery([
            {$match:{_id: new ObjectId(id)}}
        ],visitorId)

        if(posts.length){
            
            resolve(posts[0])
        }
        else{
            reject()
        }
    })
}


Post.findByAuthorId =function(authorId){
    return Post.reusablePostQuery([
        {$match:{author:authorId}},
        {$sort:{createdDate:-1}}
    ])
}

Post.delete =function(postIdToDelete,visitorId){
    return new Promise(async (resolve,reject)=>{
        try{
            let post = await Post.findSingleById(postIdToDelete,visitorId)
            if(post.isVisitorOwner){
                await postCollection.deleteOne({_id:new ObjectId(postIdToDelete)})
                resolve()
            }
            else{
                reject()
            }
        }
        catch{
            reject()
        }
    })
}

Post.search =function(searchTerm){
    return new Promise(async (resolve,reject)=>{
        if(typeof(searchTerm)=="string"){
            let posts= await Post.reusablePostQuery([
                {$match:{$text:{$search: searchTerm}}},
                {$sort:{score:{$meta:"textScore"}}}
            ])
            resolve(posts)
        }
        else{
            
            reject()
        }
    })
}

Post.countPostsByAuthor =function(id){
    return new Promise(async (resolve,reject)=>{
        let postCount= await postCollection.countDocuments({author:id})
        resolve(postCount)
    })
}

Post.getFeed = async function(id){
    //get an array users that are followed by current user
    let followedUsers = await followCollection.find({authorId:new ObjectId(id)}).toArray()
    followedUsers=followedUsers.map(function(followDoc){
        return followDoc.followedId
    })
    //get the posts of above users in the array
    return Post.reusablePostQuery([
        {$match: {author :{$in: followedUsers}}},
        {$sort:{createdDate:-1}}
    ])
}

module.exports= Post